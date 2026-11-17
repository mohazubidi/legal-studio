import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { normalizeSearch } from "@/lib/library/format";
import { TestDatabase } from "./harness";

const url = process.env.TEST_DATABASE_URL;

const law = (overrides: Record<string, unknown> = {}) => ({
  source: "boe",
  external_id: "labor-law",
  title: "نظام العمل",
  category: "العمل والتوظيف",
  issued_on: "23/8/1426هـ",
  status: "in_force",
  source_url: "https://laws.boe.gov.sa/example",
  fetched_at: "2026-11-01T10:00:00Z",
  articles: [
    { label: "المادة الأولى", text: "يسمى هذا النظام نظام العمل." },
    { label: "المادة الثانية", text: "يُقصد بالألفاظ والعبارات الآتية المعاني المبينة أمامها." },
  ],
  ...overrides,
});

/** The library is readable by signed-in users, writable only through the service-role import. */
describe.skipIf(!url)("legal library", () => {
  let db: TestDatabase;
  let alice: string;
  let bob: string;

  beforeAll(async () => {
    db = await TestDatabase.create(url as string);
    alice = await db.createUser("alice@example.test");
    bob = await db.createUser("bob@example.test");
  }, 60_000);

  afterAll(async () => {
    await db?.destroy();
  });

  const upsert = (payload: unknown) =>
    db.as("service_role", null, async (q) => {
      const [row] = await q<{ r: { id: string; result: string; content_hash: string } }>("select public.library_upsert_law($1) as r", [payload]);
      return row.r;
    });

  it("imports a law with its articles, then reports unchanged, then replaces the articles atomically", async () => {
    const created = await upsert(law());
    expect(created.result).toBe("created");
    expect(created.content_hash).toMatch(/^[0-9a-f]{64}$/);

    const again = await upsert(law({ fetched_at: "2026-11-10T10:00:00Z" }));
    expect(again).toMatchObject({ id: created.id, result: "unchanged", content_hash: created.content_hash });

    const updated = await upsert(law({ amended_on: "1/1/1447هـ", articles: [{ label: "المادة الأولى", text: "نص معدّل." }] }));
    expect(updated).toMatchObject({ id: created.id, result: "updated" });
    expect(updated.content_hash).not.toBe(created.content_hash);

    const rows = await db.raw<{ label: string; text: string; position: number }>("select position, label, text from library_articles where law_id = $1 order by position", [created.id]);
    expect(rows).toEqual([{ position: 1, label: "المادة الأولى", text: "نص معدّل." }]);
    const [stored] = await db.raw<{ article_count: number; amended_on: string; fetched_at: Date }>("select article_count, amended_on, fetched_at from library_laws where id = $1", [created.id]);
    expect(stored.article_count).toBe(1);
    expect(stored.amended_on).toBe("1/1/1447هـ");
  });

  it("rejects a law without articles and leaves nothing behind", async () => {
    await expect(upsert(law({ external_id: "empty", articles: [] }))).rejects.toThrow(/no articles/);
    expect(await db.raw("select 1 from library_laws where external_id = 'empty'")).toHaveLength(0);
  });

  it("signed-in users can read the library; nobody can write it through the API", async () => {
    const [{ id }] = await db.raw<{ id: string }>("select id from library_laws where external_id = 'labor-law'");
    expect(await db.as("authenticated", alice, (q) => q("select title from library_laws where id = $1", [id]))).toHaveLength(1);
    expect(await db.as("authenticated", bob, (q) => q("select label from library_articles where law_id = $1", [id]))).toHaveLength(1);

    await expect(db.as("anon", null, (q) => q("select 1 from library_laws"))).rejects.toThrow(/permission denied/);
    await expect(db.as("authenticated", alice, (q) => q("update library_laws set title = 'x' where id = $1", [id]))).rejects.toThrow(/permission denied/);
    await expect(db.as("authenticated", alice, (q) => q("delete from library_articles where law_id = $1", [id]))).rejects.toThrow(/permission denied/);
    await expect(
      db.as("authenticated", alice, (q) => q("insert into library_articles (law_id, position, label, text) values ($1, 9, 'م', 'نص')", [id])),
    ).rejects.toThrow(/permission denied/);
    await expect(db.as("authenticated", alice, (q) => q("select public.library_upsert_law($1)", [law({ external_id: "sneaky" })]))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("a matter source records which law and version it was copied from, and only the owner sees it", async () => {
    const [lib] = await db.raw<{ id: string; content_hash: string }>("select id, content_hash from library_laws where external_id = 'labor-law'");
    const docId = randomUUID();
    const matter = await db.as("authenticated", alice, async (q) => {
      const [m] = await q<{ id: string }>("insert into matters (matter_name) values ('قضية عمالية') returning id");
      await q(
        `insert into documents (id, matter_id, file_name, file_type, file_size_bytes, storage_path, source_kind, library_law_id, library_version)
         values ($1, $2, 'نظام العمل.txt', 'text/plain', 10, $3, 'legal_text', $4, $5)`,
        [docId, m.id, `${m.id}/${docId}/source.txt`, lib.id, lib.content_hash],
      );
      return m.id;
    });
    expect(matter).toBeTruthy();
    expect(await db.as("authenticated", bob, (q) => q("select 1 from documents where id = $1", [docId]))).toHaveLength(0);
    await expect(
      db.as("authenticated", alice, (q) => q("update documents set library_version = $2 where id = $1", [docId, "0".repeat(64)])),
    ).rejects.toThrow(/permission denied/);
  });

  it("search normalization in SQL matches the app's", async () => {
    const samples = ["نِظَامُ العمل", "الإجراءات الجزائية", "آلية الأحوال الشخصية", "اللائحة التنفيذية", "مـــادة  أولى", "Saudi LAW"];
    for (const sample of samples) {
      const [row] = await db.raw<{ n: string }>("select public.library_normalize($1) as n", [sample]);
      expect(row.n).toBe(normalizeSearch(sample));
    }
    const [{ search_title }] = await db.raw<{ search_title: string }>("select search_title from library_laws where external_id = 'labor-law'");
    expect(search_title).toBe("نظام العمل");
  });
});
