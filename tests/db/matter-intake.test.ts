import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TestDatabase } from "./harness";

const url = process.env.TEST_DATABASE_URL;

/** Provisional intake matters and their finalisation, under RLS. */
describe.skipIf(!url)("matter intake", () => {
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

  const startIntake = () =>
    db.as("authenticated", alice, async (q) => {
      const [row] = await q<{ id: string }>("insert into matters (matter_name, status) values ('استقبال جديد', 'intake') returning id");
      return row.id;
    });

  it("creates a provisional matter that only its owner can see", async () => {
    const id = await startIntake();
    const own = await db.as("authenticated", alice, (q) => q<{ status: string }>("select status from matters where id = $1", [id]));
    expect(own).toEqual([{ status: "intake" }]);
    expect(await db.as("authenticated", bob, (q) => q("select id from matters where id = $1", [id]))).toHaveLength(0);
  });

  it("stores the client's form answers and statement as their own source kinds", async () => {
    const matter = await startIntake();
    for (const kind of ["intake_form", "client_statement"]) {
      const docId = randomUUID();
      await db.as("authenticated", alice, (q) =>
        q(
          `insert into documents (id, matter_id, file_name, file_type, file_size_bytes, storage_path, source_kind)
           values ($1, $2, 'x.txt', 'text/plain', 10, $3, $4)`,
          [docId, matter, `${matter}/${docId}/source.txt`, kind],
        ),
      );
    }
    const kinds = await db.raw<{ source_kind: string }>("select source_kind from documents where matter_id = $1 order by source_kind", [matter]);
    expect(kinds.map((k) => k.source_kind)).toEqual(["client_statement", "intake_form"]);
  });

  it("finalises into an active matter with the brief's details; other users cannot", async () => {
    const id = await startIntake();
    const stolen = await db.as("authenticated", bob, (q) =>
      q("update matters set status = 'active', client_name = 'x' where id = $1 and status = 'intake' returning id", [id]),
    );
    expect(stolen).toHaveLength(0);
    const done = await db.as("authenticated", alice, (q) =>
      q<{ id: string }>(
        "update matters set matter_name = $2, client_name = $3, description = $4, status = 'active' where id = $1 and status = 'intake' returning id",
        [id, "مؤسسة الريادة ضد البنيان", "مؤسسة الريادة", "ملخص الاستقبال"],
      ),
    );
    expect(done).toHaveLength(1);
    // Finalising twice is a no-op: the status guard no longer matches.
    const again = await db.as("authenticated", alice, (q) => q("update matters set status = 'active' where id = $1 and status = 'intake' returning id", [id]));
    expect(again).toHaveLength(0);
    const [audit] = await db.raw<{ details: { from: string; to: string } }>(
      "select details from audit_logs where action = 'matter.status_changed' and matter_id = $1",
      [id],
    );
    expect(audit.details).toMatchObject({ from: "intake", to: "active" });
  });

  it("keeps intake matters out of the regular matter list", async () => {
    const id = await startIntake();
    const listed = await db.as("authenticated", alice, (q) => q<{ id: string }>("select id from matters where status <> 'intake'"));
    expect(listed.map((r) => r.id)).not.toContain(id);
  });
});
