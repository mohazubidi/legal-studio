import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TestDatabase } from "./harness";

const url = process.env.TEST_DATABASE_URL;

/**
 * Ownership and access boundaries, enforced by Postgres RLS + column grants.
 * Runs only when TEST_DATABASE_URL points at a disposable database server
 * (`npm run test:db` provisions one).
 */
describe.skipIf(!url)("database access boundaries", () => {
  let db: TestDatabase;
  let alice: string;
  let bob: string;
  let aliceMatter: string;
  let aliceDoc: string;
  let aliceDocPath: string;
  let aliceOutput: string;

  beforeAll(async () => {
    db = await TestDatabase.create(url as string);
    alice = await db.createUser("alice@example.test");
    bob = await db.createUser("bob@example.test");

    aliceMatter = await db.as("authenticated", alice, async (q) => {
      const [row] = await q<{ id: string }>(
        "insert into matters (matter_name, client_name) values ('نزاع تجاري', 'شركة أ') returning id",
      );
      return row.id;
    });

    aliceDoc = randomUUID();
    aliceDocPath = `${aliceMatter}/${aliceDoc}/contract.pdf`;
    await db.as("authenticated", alice, async (q) => {
      await q(
        `insert into documents (id, matter_id, file_name, file_type, file_size_bytes, storage_path)
         values ($1, $2, 'contract.pdf', 'application/pdf', 1024, $3)`,
        [aliceDoc, aliceMatter, aliceDocPath],
      );
      await q("insert into storage.objects (bucket_id, name) values ('matter-documents', $1)", [aliceDocPath]);
      const [output] = await q<{ id: string }>(
        "insert into outputs (matter_id, tool_type, title) values ($1, 'legal_memo', 'مذكرة') returning id",
        [aliceMatter],
      );
      aliceOutput = output.id;
      await q(
        "insert into source_references (output_id, document_id, source_text, page_or_section) values ($1, $2, 'البند 4', 'ص 2')",
        [aliceOutput, aliceDoc],
      );
    });
  }, 60_000);

  afterAll(async () => {
    await db?.destroy();
  });

  describe("matters", () => {
    it("owner sees their matter; user_id is stamped from the session", async () => {
      const rows = await db.as("authenticated", alice, (q) => q<{ user_id: string }>("select user_id from matters"));
      expect(rows).toEqual([{ user_id: alice }]);
    });

    it("another user cannot see, update or delete it", async () => {
      await db.as("authenticated", bob, async (q) => {
        expect(await q("select id from matters where id = $1", [aliceMatter])).toHaveLength(0);
        expect(await q("update matters set matter_name = 'x' where id = $1 returning id", [aliceMatter])).toHaveLength(0);
        expect(await q("delete from matters where id = $1 returning id", [aliceMatter])).toHaveLength(0);
      });
      const [row] = await db.raw<{ matter_name: string }>("select matter_name from matters where id = $1", [aliceMatter]);
      expect(row.matter_name).toBe("نزاع تجاري");
    });

    it("a user cannot create a matter on behalf of someone else", async () => {
      await expect(
        db.as("authenticated", bob, (q) => q("insert into matters (user_id, matter_name) values ($1, 'x')", [alice])),
      ).rejects.toThrow(/permission denied/);
    });

    it("ownership cannot be transferred", async () => {
      await expect(
        db.as("authenticated", alice, (q) => q("update matters set user_id = $1 where id = $2", [bob, aliceMatter])),
      ).rejects.toThrow(/permission denied/);
    });

    it("anonymous requests have no access", async () => {
      await expect(db.as("anon", null, (q) => q("select id from matters"))).rejects.toThrow(/permission denied/);
    });

    it("validates input at the database", async () => {
      await expect(
        db.as("authenticated", alice, (q) => q("insert into matters (matter_name) values ('   ')")),
      ).rejects.toThrow(/check constraint/);
    });
  });

  describe("documents", () => {
    it("another user cannot read documents of a matter they do not own", async () => {
      const rows = await db.as("authenticated", bob, (q) => q("select id from documents"));
      expect(rows).toHaveLength(0);
    });

    it("another user cannot add a document to someone else's matter", async () => {
      const id = randomUUID();
      await expect(
        db.as("authenticated", bob, (q) =>
          q(
            `insert into documents (id, matter_id, file_name, file_type, file_size_bytes, storage_path)
             values ($1, $2, 'x.pdf', 'application/pdf', 10, $3)`,
            [id, aliceMatter, `${aliceMatter}/${id}/x.pdf`],
          ),
        ),
      ).rejects.toThrow(/row-level security/);
    });

    it("storage_path must be scoped to the row's own matter and id", async () => {
      const bobMatter = await db.as("authenticated", bob, async (q) => {
        const [row] = await q<{ id: string }>("insert into matters (matter_name) values ('ملف بوب') returning id");
        return row.id;
      });
      const id = randomUUID();
      // Bob tries to register Alice's file path under his own matter.
      await expect(
        db.as("authenticated", bob, (q) =>
          q(
            `insert into documents (id, matter_id, file_name, file_type, file_size_bytes, storage_path)
             values ($1, $2, 'x.pdf', 'application/pdf', 10, $3)`,
            [id, bobMatter, aliceDocPath],
          ),
        ),
      ).rejects.toThrow(/documents_storage_path_scoped/);
    });

    it("a document cannot be moved to another matter or re-pointed", async () => {
      await expect(
        db.as("authenticated", alice, (q) =>
          q("update documents set storage_path = 'x/y/z' where id = $1", [aliceDoc]),
        ),
      ).rejects.toThrow(/permission denied/);
      await expect(
        db.as("authenticated", alice, (q) => q("update documents set matter_id = $1 where id = $2", [randomUUID(), aliceDoc])),
      ).rejects.toThrow(/permission denied/);
    });

    it("an error message is only allowed with the failed status", async () => {
      await expect(
        db.as("authenticated", alice, (q) =>
          q("update documents set processing_error = 'boom' where id = $1", [aliceDoc]),
        ),
      ).rejects.toThrow(/documents_error_only_when_failed/);
    });
  });

  describe("storage objects", () => {
    it("owner can read the object behind their document; others cannot", async () => {
      const own = await db.as("authenticated", alice, (q) => q("select name from storage.objects"));
      expect(own).toEqual([{ name: aliceDocPath }]);
      const other = await db.as("authenticated", bob, (q) => q("select name from storage.objects"));
      expect(other).toHaveLength(0);
    });

    it("cannot upload an object that no owned document points to", async () => {
      await expect(
        db.as("authenticated", alice, (q) =>
          q("insert into storage.objects (bucket_id, name) values ('matter-documents', $1)", [
            `${aliceMatter}/${randomUUID()}/stray.pdf`,
          ]),
        ),
      ).rejects.toThrow(/row-level security/);
    });

    it("another user cannot overwrite or delete the object", async () => {
      const deleted = await db.as("authenticated", bob, (q) =>
        q("delete from storage.objects where name = $1 returning id", [aliceDocPath]),
      );
      expect(deleted).toHaveLength(0);
      const updated = await db.as("authenticated", alice, (q) =>
        q("update storage.objects set name = name where name = $1 returning id", [aliceDocPath]),
      );
      expect(updated).toHaveLength(0); // no update policy: objects are immutable
    });

    it("the bucket is private", async () => {
      const [bucket] = await db.raw<{ public: boolean }>("select public from storage.buckets where id = 'matter-documents'");
      expect(bucket.public).toBe(false);
    });
  });

  describe("outputs and source references", () => {
    it("another user cannot see outputs or their references", async () => {
      await db.as("authenticated", bob, async (q) => {
        expect(await q("select id from outputs")).toHaveLength(0);
        expect(await q("select id from source_references")).toHaveLength(0);
      });
    });

    it("another user cannot attach an output to someone else's matter", async () => {
      await expect(
        db.as("authenticated", bob, (q) =>
          q("insert into outputs (matter_id, tool_type, title) values ($1, 'casemap', 'x')", [aliceMatter]),
        ),
      ).rejects.toThrow(/row-level security/);
    });

    it("a reference cannot cite a document from a different matter", async () => {
      const otherMatterDoc = await db.as("authenticated", alice, async (q) => {
        const [m] = await q<{ id: string }>("insert into matters (matter_name) values ('ملف آخر') returning id");
        const id = randomUUID();
        await q(
          `insert into documents (id, matter_id, file_name, file_type, file_size_bytes, storage_path)
           values ($1, $2, 'other.txt', 'text/plain', 5, $3)`,
          [id, m.id, `${m.id}/${id}/other.txt`],
        );
        return id;
      });
      await expect(
        db.as("authenticated", alice, (q) =>
          q("insert into source_references (output_id, document_id, source_text) values ($1, $2, 'x')", [
            aliceOutput,
            otherMatterDoc,
          ]),
        ),
      ).rejects.toThrow(/row-level security/);
    });
  });

  describe("audit logs", () => {
    it("writes are audited automatically and visible only to their owner", async () => {
      const own = await db.as("authenticated", alice, (q) =>
        q<{ action: string }>("select action from audit_logs where matter_id = $1 order by created_at", [aliceMatter]),
      );
      expect(own.map((r) => r.action)).toEqual(
        expect.arrayContaining(["matter.created", "document.created", "output.created"]),
      );
      const other = await db.as("authenticated", bob, (q) =>
        q("select id from audit_logs where matter_id = $1", [aliceMatter]),
      );
      expect(other).toHaveLength(0);
    });

    it("records status transitions", async () => {
      await db.as("authenticated", alice, (q) =>
        q("update documents set processing_status = 'uploaded' where id = $1", [aliceDoc]),
      );
      const [row] = await db.raw<{ details: { from: string; to: string } }>(
        "select details from audit_logs where action = 'document.status_changed' and details ->> 'id' = $1",
        [aliceDoc],
      );
      expect(row.details).toMatchObject({ from: "pending", to: "uploaded" });
    });

    it("is append-only and cannot be forged for another user", async () => {
      await expect(
        db.as("authenticated", alice, (q) => q("update audit_logs set action = 'x.y'")),
      ).rejects.toThrow(/permission denied/);
      await expect(db.as("authenticated", alice, (q) => q("delete from audit_logs"))).rejects.toThrow(
        /permission denied/,
      );
      await expect(
        db.as("authenticated", bob, (q) =>
          q("insert into audit_logs (matter_id, action) values ($1, 'document.downloaded')", [aliceMatter]),
        ),
      ).rejects.toThrow(/row-level security/);
    });

    it("deleting a user removes their data without failing on the audit trail", async () => {
      const carol = await db.createUser("carol@example.test");
      await db.as("authenticated", carol, (q) => q("insert into matters (matter_name) values ('مؤقت')"));
      await db.raw("delete from auth.users where id = $1", [carol]);
      const left = await db.raw("select id from matters where user_id = $1", [carol]);
      expect(left).toHaveLength(0);
    });
  });
});
