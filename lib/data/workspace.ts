import "server-only";
import { createSupabaseServerClient, getSessionState, type AppSupabaseClient } from "@/lib/supabase/server";
import type { DocumentRow, MatterRow, OutputRow } from "@/types/database";
import { fromPostgrest, ok, type DataResult } from "./result";

/**
 * Cross-matter listings for the workspace pages (dashboard, documents, outputs).
 * Every query runs under the caller's session, so RLS limits rows to their own
 * matters. Rows of matters still in intake are left out: an intake is not a
 * matter until it is finalised.
 */

type MatterRef = Pick<MatterRow, "id" | "matter_name" | "status">;

export type DocumentListRow = Pick<
  DocumentRow,
  "id" | "matter_id" | "file_name" | "file_type" | "file_size_bytes" | "source_kind" | "processing_status" | "processing_error" | "created_at"
> & { matter: MatterRef | null };

export type OutputListRow = Pick<OutputRow, "id" | "matter_id" | "tool_type" | "title" | "status" | "created_at" | "updated_at"> & {
  matter: MatterRef | null;
};

const notIntake = <T extends { matter: MatterRef | null }>(row: T) => row.matter !== null && row.matter.status !== "intake";

export async function listAllDocuments(supabase: AppSupabaseClient, limit = 500): Promise<DataResult<DocumentListRow[]>> {
  const { data, error } = await supabase
    .from("documents")
    .select("id, matter_id, file_name, file_type, file_size_bytes, source_kind, processing_status, processing_error, created_at, matter:matters(id, matter_name, status)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return fromPostgrest(error, "listAllDocuments");
  return ok((data as unknown as DocumentListRow[]).filter(notIntake));
}

export async function listAllOutputs(supabase: AppSupabaseClient, limit = 500): Promise<DataResult<OutputListRow[]>> {
  const { data, error } = await supabase
    .from("outputs")
    .select("id, matter_id, tool_type, title, status, created_at, updated_at, matter:matters(id, matter_name, status)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return fromPostgrest(error, "listAllOutputs");
  return ok((data as unknown as OutputListRow[]).filter(notIntake));
}

/**
 * The data source for a workspace page: the signed-in user's database client,
 * or "preview" (local preview mode, no Supabase), where pages show labelled samples.
 * The workspace layout has already rejected anonymous and unconfigured requests.
 */
export async function workspaceSource(): Promise<{ kind: "live"; supabase: AppSupabaseClient } | { kind: "preview" }> {
  const session = await getSessionState();
  if (session.kind !== "authenticated") return { kind: "preview" };
  const supabase = await createSupabaseServerClient();
  return supabase ? { kind: "live", supabase } : { kind: "preview" };
}
