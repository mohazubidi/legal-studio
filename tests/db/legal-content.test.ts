import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TestDatabase } from "./harness";

const url = process.env.TEST_DATABASE_URL;

/** Persistence of legal content: source kinds, saved edits, return to draft, isolation. */
describe.skipIf(!url)("legal content", () => {
  let db: TestDatabase;
  let alice: string;
  let bob: string;
  let matter: string;

  beforeAll(async () => {
    db = await TestDatabase.create(url as string);
    alice = await db.createUser("alice@example.test");
    bob = await db.createUser("bob@example.test");
    matter = await db.as("authenticated", alice, async (q) => {
      const [row] = await q<{ id: string }>("insert into matters (matter_name) values ('محتوى المكتب') returning id");
      return row.id;
    });
  }, 60_000);

  afterAll(async () => {
    await db?.destroy();
  });

  const addSource = (kind: string) => {
    const id = randomUUID();
    return db.as("authenticated", alice, (q) =>
      q(
        `insert into documents (id, matter_id, file_name, file_type, file_size_bytes, storage_path, source_kind)
         values ($1, $2, 'x.txt', 'text/plain', 10, $3, $4) returning id`,
        [id, matter, `${matter}/${id}/source.txt`, kind],
      ),
    );
  };

  const content = (title: string) => ({ version: 1, kind: "legal_content", format: "carousel", title, cards: [] });

  const createOutput = () =>
    db.as("authenticated", alice, async (q) => {
      const [row] = await q<{ id: string }>(
        "insert into outputs (matter_id, tool_type, title, content) values ($1, 'legal_content', 'عرض شرائح', $2) returning id",
        [matter, content("العنوان الأول")],
      );
      return row.id;
    });

  it("accepts legal text, article and regulation update as source kinds, and nothing else", async () => {
    for (const kind of ["legal_text", "article", "regulation_update"]) await expect(addSource(kind)).resolves.toHaveLength(1);
    await expect(addSource("press_release")).rejects.toThrow(/documents_source_kind_check/);
  });

  it("saves the lawyer's edits and reads them back", async () => {
    const id = await createOutput();
    await db.as("authenticated", alice, (q) => q("update outputs set content = $2, title = $3 where id = $1", [id, content("عنوان عدّله المحامي"), "عرض شرائح — عنوان عدّله المحامي"]));
    const [row] = await db.as("authenticated", alice, (q) => q<{ content: { title: string }; title: string; status: string }>("select content, title, status from outputs where id = $1", [id]));
    expect(row.content.title).toBe("عنوان عدّله المحامي");
    expect(row.title).toBe("عرض شرائح — عنوان عدّله المحامي");
    expect(row.status).toBe("draft");
  });

  it("editing approved content returns it to draft, so approval never covers changed text", async () => {
    const id = await createOutput();
    await db.as("authenticated", alice, async (q) => {
      await q("update outputs set status = 'in_review' where id = $1", [id]);
      await q("update outputs set status = 'reviewed' where id = $1", [id]);
      await q("update outputs set status = 'approved' where id = $1", [id]);
    });
    const [approved] = await db.raw<{ status: string; approved_at: string | null }>("select status, approved_at from outputs where id = $1", [id]);
    expect(approved.status).toBe("approved");
    expect(approved.approved_at).not.toBeNull();

    await db.as("authenticated", alice, (q) => q("update outputs set content = $2 where id = $1", [id, content("تعديل بعد الاعتماد")]));
    const [after] = await db.raw<{ status: string; approved_at: string | null }>("select status, approved_at from outputs where id = $1", [id]);
    expect(after).toEqual({ status: "draft", approved_at: null });
  });

  it("another user can neither read nor edit the content", async () => {
    const id = await createOutput();
    expect(await db.as("authenticated", bob, (q) => q("select id from outputs where id = $1", [id]))).toHaveLength(0);
    const updated = await db.as("authenticated", bob, (q) => q("update outputs set content = $2 where id = $1 returning id", [id, content("اختراق")]));
    expect(updated).toHaveLength(0);
    const [row] = await db.raw<{ content: { title: string } }>("select content from outputs where id = $1", [id]);
    expect(row.content.title).toBe("العنوان الأول");
  });
});
