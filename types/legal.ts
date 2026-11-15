import type { LucideIcon } from "lucide-react";

/** Provenance of every item an AI tool produces. Drives colour, icon and label. */
export type ProvenanceType = "source" | "analysis" | "missing" | "verify";

export type ReviewStatus = "draft" | "in_review" | "reviewed" | "approved";
export type MatterStatus = "active" | "on_hold" | "closed" | "intake";
export type ToolStatus = "available" | "coming_soon";

export type StatusVariant =
  | ReviewStatus
  | MatterStatus
  | ToolStatus
  | ProvenanceType
  | "pending"
  | "uploaded"
  | "processing"
  | "processed"
  | "failed";

export interface Citation {
  documentId: string;
  documentName: string;
  /** Page number, for paginated sources. */
  page?: number;
  /** Human label of the page or section, e.g. "صفحة 3" or "فقرات 4–6". Preferred over `page`. */
  location?: string;
  /** Paragraph anchor in the DocumentViewer, e.g. "p2-3". */
  anchor?: string;
  excerpt: string;
  /** Number shown on the chip; defaults to the position within the item. */
  number?: number;
  /** Where "view source" leads; defaults to the document page. */
  href?: string;
}

export interface ResultItem {
  id: string;
  type: ProvenanceType;
  text: string;
  /** Required for `source` items; optional otherwise. */
  citations?: Citation[];
  /** Short qualifier shown under the text, e.g. why an item needs verification. */
  note?: string;
}

export interface ResultSection {
  id: string;
  title: string;
  items: ResultItem[];
}

export interface ToolResult {
  toolId: ToolId;
  title: string;
  generatedAt: string;
  status: ReviewStatus;
  isSample: boolean;
  sections: ResultSection[];
}

export type ToolId =
  | "legal-memo"
  | "casemap"
  | "contract-compass"
  | "regdelta"
  | "matter-intake"
  | "legal-content";

export interface ToolDefinition {
  id: ToolId;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  icon: LucideIcon;
  status: ToolStatus;
}

export interface Matter {
  id: string;
  reference: string;
  title: string;
  client: string;
  practiceArea: string;
  status: MatterStatus;
  updatedAt: string;
}

export interface DocumentParagraph {
  anchor: string;
  text: string;
}

export interface DocumentPage {
  number: number;
  paragraphs: DocumentParagraph[];
}

export interface LegalDocument {
  id: string;
  name: string;
  matterId: string;
  kind: string;
  mimeType: "application/pdf" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  sizeBytes: number;
  uploadedAt: string;
  status: "processing" | "reviewed" | "failed";
  pages: DocumentPage[];
}

export interface Output {
  id: string;
  title: string;
  toolId: ToolId;
  matterId: string;
  status: ReviewStatus;
  createdAt: string;
  result: ToolResult;
}
