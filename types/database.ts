/**
 * Database types for the `public` schema, in the shape `supabase gen types` emits.
 *
 * Handwritten to match supabase/migrations. `Insert` / `Update` list only the
 * columns the `authenticated` role is granted, so writing an ownership column
 * (user_id, matter_id on update, storage_path on update…) is a compile error
 * as well as a database error. Regenerate or update this file with every migration.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type MatterStatus = "active" | "on_hold" | "closed";
export type DocumentProcessingStatus = "pending" | "uploaded" | "processing" | "processed" | "failed";
export type OutputStatus = "draft" | "in_review" | "reviewed" | "approved";
export type SourceKind = "document" | "pasted_text" | "lawyer_notes" | "meeting_transcript" | "audio_recording";

/** A citable unit of a source's text: a PDF page, a group of paragraphs, or a transcript span. */
export interface DocumentSegment {
  id: string;
  label: string;
  text: string;
}

export type ToolType = "legal_memo" | "casemap" | "contract_compass" | "regdelta" | "matter_intake" | "legal_content";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          organization: string | null;
          role: string;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: { full_name?: string | null; organization?: string | null };
        Relationships: [];
      };
      matters: {
        Row: {
          id: string;
          user_id: string;
          matter_name: string;
          matter_type: string | null;
          client_name: string | null;
          description: string | null;
          status: MatterStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          matter_name: string;
          matter_type?: string | null;
          client_name?: string | null;
          description?: string | null;
          status?: MatterStatus;
        };
        Update: {
          matter_name?: string;
          matter_type?: string | null;
          client_name?: string | null;
          description?: string | null;
          status?: MatterStatus;
        };
        Relationships: [];
      };
      documents: {
        Row: {
          id: string;
          matter_id: string;
          file_name: string;
          file_type: string;
          file_size_bytes: number;
          storage_path: string;
          extracted_text: string | null;
          document_date: string | null;
          document_category: string | null;
          processing_status: DocumentProcessingStatus;
          processing_error: string | null;
          source_kind: SourceKind;
          segments: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          matter_id: string;
          file_name: string;
          file_type: string;
          file_size_bytes: number;
          storage_path: string;
          document_date?: string | null;
          document_category?: string | null;
          source_kind?: SourceKind;
        };
        Update: {
          file_name?: string;
          extracted_text?: string | null;
          document_date?: string | null;
          document_category?: string | null;
          processing_status?: DocumentProcessingStatus;
          processing_error?: string | null;
          segments?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "documents_matter_id_fkey";
            columns: ["matter_id"];
            isOneToOne: false;
            referencedRelation: "matters";
            referencedColumns: ["id"];
          },
        ];
      };
      outputs: {
        Row: {
          id: string;
          matter_id: string;
          tool_type: ToolType;
          title: string;
          content: Json;
          status: OutputStatus;
          review_notes: string | null;
          reviewed_at: string | null;
          approved_at: string | null;
          approved_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          matter_id: string;
          tool_type: ToolType;
          title: string;
          content?: Json;
          status?: OutputStatus;
        };
        Update: { title?: string; content?: Json; status?: OutputStatus; review_notes?: string | null };
        Relationships: [
          {
            foreignKeyName: "outputs_matter_id_fkey";
            columns: ["matter_id"];
            isOneToOne: false;
            referencedRelation: "matters";
            referencedColumns: ["id"];
          },
        ];
      };
      source_references: {
        Row: {
          id: string;
          output_id: string;
          document_id: string;
          source_text: string;
          page_or_section: string | null;
          segment_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          segment_id?: string | null;
          output_id: string;
          document_id: string;
          source_text: string;
          page_or_section?: string | null;
        };
        Update: never;
        Relationships: [
          {
            foreignKeyName: "source_references_output_id_fkey";
            columns: ["output_id"];
            isOneToOne: false;
            referencedRelation: "outputs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "source_references_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_logs: {
        Row: {
          id: string;
          user_id: string;
          matter_id: string | null;
          action: string;
          details: Json;
          created_at: string;
        };
        Insert: { matter_id?: string | null; action: string; details?: Json };
        Update: never;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      owns_matter: { Args: { target_matter_id: string }; Returns: boolean };
      can_reference: { Args: { target_output_id: string; target_document_id: string }; Returns: boolean };
      can_access_document_object: { Args: { object_name: string }; Returns: boolean };
    };
    Enums: {
      matter_status: MatterStatus;
      document_processing_status: DocumentProcessingStatus;
      output_status: OutputStatus;
      tool_type: ToolType;
    };
    CompositeTypes: { [_ in never]: never };
  };
}

type PublicSchema = Database["public"];
export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"];

export type MatterRow = Tables<"matters">;
export type DocumentRow = Tables<"documents">;
export type OutputRow = Tables<"outputs">;
export type SourceReferenceRow = Tables<"source_references">;
export type AuditLogRow = Tables<"audit_logs">;
