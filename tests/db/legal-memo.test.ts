import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildMemoRecord } from "@/lib/tools/legal-memo/record";
import { parseMemoContent } from "@/lib/tools/legal-memo/content";
import { TestDatabase, type Query } from "./harness";

const url = process.env.TEST_DATABASE_URL;

/**
 * Persistence of memo source references, and the human-review workflow
 * enforced by the database. Uses the same record builder as the application.
 */
describe.skipIf(!url)("legal memo persistence and review", () => {
  let db: TestDatabase;
  let alice: string;
  let bob: string;
  let matter: string;
  let otherMatter: string;
  let docId: string;

  /** Saves a record the way service.saveMemoRecord does: output first, then references with their ids. */
  async function saveRecord(q: Query, matterId: string, record: ReturnType<typeof buildMemoRecord>): Promise<string> {
    const [output] = await q<{ id: string }>(
      "insert into outputs (matter_id, tool_type, title, content, status) values ($1, 'legal_memo', 'مذكرة', $2, 'draft') returning id",
      [matterId, record.content],
    );
    for (const ref of record.references) {
      await q(
        `insert into source_references (id, output_id, document_id, source_text, page_or_section, segment_id)
         values ($1, $2, $3, $4, $5, $6)`,
        [ref.id, output.id, ref.document_id, ref.source_text, ref.page_or_section, ref.segment_id],
      );
    }
    return output.id;
  }

  function record(documentId: string) {
    return buildMemoRecord({
      analysis: {
        matter_summary: { text: "نزاع توريد", citations: [{ source_id: "S1", segment_id: "p1", quote: "يلتزم المورد بالتسليم" }] },
        facts: [
          { category: "amount", text: "قيمة العقد 450,000 ريال", citations: [{ source_id: "S1", segment_id: "p2", quote: "قيمة العقد 450,000 ريال" }] },
        ],
        missing_information: [],
        legal_issues: [],
        research_questions: [],
        relevant_documents: [],
        analysis_structure: [],
      },
      sources: [
        {
          sourceId: "S1",
          documentId,
          fileName: "عقد.pdf",
          segments: [
            { id: "p1", label: "صفحة 1", text: "يلتزم المورد بالتسليم خلال ثلاثين يومًا." },
            { id: "p2", label: "صفحة 2", text: "قيمة العقد 450,000 ريال شاملة الضريبة." },
          ],
        },
      ],
      snapshot: [
        { document_id: documentId, label: "S1", file_name: "عقد.pdf", source_kind: "document", processing_status: "processed", processing_error: null, included: true },
      ],
      model: "test",
      now: new Date().toISOString(),
      newId: randomUUID,
    });
  }

  beforeAll(async () => {
    db = await TestDatabase.create(url as string);
    alice = await db.createUser("alice@example.test");
    bob = await db.createUser("bob@example.test");
    [matter, otherMatter] = await db.as("authenticated", alice, async (q) => {
      const rows = await q<{ id: string }>("insert into matters (matter_name) values ('ملف أ'), ('ملف ب') returning id");
      return [rows[0].id, rows[1].id];
    });
    docId = randomUUID();
    await db.as("authenticated", alice, (q) =>
      q(
        `insert into documents (id, matter_id, file_name, file_type, file_size_bytes, storage_path, source_kind)
         values ($1, $2, 'عقد.pdf', 'application/pdf', 100, $3, 'document')`,
        [docId, matter, `${matter}/${docId}/source.pdf`],
      ),
    );
  }, 60_000);

  afterAll(async () => {
    await db?.destroy();
  });

  it("persists every reference the content points to, with document, segment and excerpt", async () => {
    const memo = record(docId);
    const outputId = await db.as("authenticated", alice, (q) => saveRecord(q, matter, memo));

    const [stored] = await db.as("authenticated", alice, (q) => q<{ content: unknown }>("select content from outputs where id = $1", [outputId]));
    const content = parseMemoContent(stored.content);
    expect(content).not.toBeNull();

    const refs = await db.as("authenticated", alice, (q) =>
      q<{ id: string; document_id: string; segment_id: string; page_or_section: string; source_text: string }>(
        "select id, document_id, segment_id, page_or_section, source_text from source_references where output_id = $1",
        [outputId],
      ),
    );
    const pointed = [...(content?.summary.reference_ids ?? []), ...(content?.facts.flatMap((f) => f.reference_ids) ?? [])];
    expect(pointed.length).toBe(2);
    for (const id of pointed) expect(refs.map((r) => r.id)).toContain(id);
    expect(refs).toContainEqual(
      expect.objectContaining({ document_id: docId, segment_id: "p2", page_or_section: "صفحة 2", source_text: "قيمة العقد 450,000 ريال" }),
    );

    // Another user sees neither the output nor its references.
    const leaked = await db.as("authenticated", bob, (q) => q("select id from source_references where output_id = $1", [outputId]));
    expect(leaked).toHaveLength(0);
  });

  it("refuses references to a document from another matter", async () => {
    await expect(db.as("authenticated", alice, (q) => saveRecord(q, otherMatter, record(docId)))).rejects.toThrow(/row-level security/);
  });

  describe("review workflow", () => {
    async function newMemo(): Promise<string> {
      return db.as("authenticated", alice, (q) => saveRecord(q, matter, record(docId)));
    }
    const setStatus = (id: string, status: string, user = alice) =>
      db.as("authenticated", user, (q) => q<{ status: string }>("update outputs set status = $1 where id = $2 returning status", [status, id]));

    it("outputs can only be created as drafts", async () => {
      await expect(
        db.as("authenticated", alice, (q) =>
          q("insert into outputs (matter_id, tool_type, title, status) values ($1, 'legal_memo', 'x', 'approved')", [matter]),
        ),
      ).rejects.toThrow(/must be created as draft/);
    });

    it("cannot skip review: draft → approved and draft → reviewed are rejected", async () => {
      const id = await newMemo();
      await expect(setStatus(id, "approved")).rejects.toThrow(/invalid review transition/);
      await expect(setStatus(id, "reviewed")).rejects.toThrow(/invalid review transition/);
    });

    it("approval through the full path records who approved and when", async () => {
      const id = await newMemo();
      await setStatus(id, "in_review");
      await setStatus(id, "reviewed");
      await setStatus(id, "approved");
      const [row] = await db.raw<{ status: string; approved_by: string; approved_at: Date | null; reviewed_at: Date | null }>(
        "select status, approved_by, approved_at, reviewed_at from outputs where id = $1",
        [id],
      );
      expect(row).toMatchObject({ status: "approved", approved_by: alice });
      expect(row.approved_at).not.toBeNull();
      expect(row.reviewed_at).not.toBeNull();
    });

    it("editing approved content returns it to draft and clears the approval", async () => {
      const id = await newMemo();
      await setStatus(id, "in_review");
      await setStatus(id, "reviewed");
      await setStatus(id, "approved");
      await db.as("authenticated", alice, (q) =>
        q("update outputs set content = jsonb_set(content, '{warnings}', '[\"edited\"]') where id = $1", [id]),
      );
      const [row] = await db.raw<{ status: string; approved_at: Date | null; approved_by: string | null }>(
        "select status, approved_at, approved_by from outputs where id = $1",
        [id],
      );
      expect(row).toEqual({ status: "draft", approved_at: null, approved_by: null });
    });

    it("approval cannot be forged by setting approval columns directly", async () => {
      const id = await newMemo();
      await expect(
        db.as("authenticated", alice, (q) => q("update outputs set approved_by = $1 where id = $2", [alice, id])),
      ).rejects.toThrow(/permission denied/);
    });

    it("another user cannot change the review state", async () => {
      const id = await newMemo();
      const rows = await setStatus(id, "in_review", bob);
      expect(rows).toHaveLength(0);
    });

    it("per-item review marks do not reset the review state, and only the owner can set them", async () => {
      const id = await newMemo();
      await setStatus(id, "in_review");
      await db.as("authenticated", alice, (q) =>
        q(`update outputs set review_marks = '{"x": {"status": "verified", "note": "", "by": "a", "at": "t"}}' where id = $1`, [id]),
      );
      const [row] = await db.raw<{ status: string; review_marks: Record<string, unknown> }>("select status, review_marks from outputs where id = $1", [id]);
      expect(row.status).toBe("in_review");
      expect(Object.keys(row.review_marks)).toEqual(["x"]);
      const updated = await db.as("authenticated", bob, (q) => q("update outputs set review_marks = '{}' where id = $1 returning id", [id]));
      expect(updated).toHaveLength(0);
      await expect(
        db.as("authenticated", alice, (q) => q("update outputs set review_marks = '[]' where id = $1", [id])),
      ).rejects.toThrow(/review_marks_is_object/);
    });

    it("status changes are written to the audit log", async () => {
      const id = await newMemo();
      await setStatus(id, "in_review");
      const rows = await db.raw<{ details: { from: string; to: string } }>(
        "select details from audit_logs where action = 'output.status_changed' and details ->> 'id' = $1",
        [id],
      );
      expect(rows[0]?.details).toMatchObject({ from: "draft", to: "in_review" });
    });
  });
});
