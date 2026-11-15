import { z } from "zod/v4";

/**
 * What the model must return. Passed to the API as a structured-output schema
 * and re-validated on the server before anything is saved or rendered.
 * Citations name a source (S1, S2…), a segment of it (p3, s2, t1…) and a quote
 * copied from that segment; the server checks every quote against the text.
 */
const citation = z.object({
  source_id: z.string(),
  segment_id: z.string(),
  quote: z.string(),
});

export const FACT_CATEGORIES = [
  "party",
  "date",
  "amount",
  "event",
  "relationship",
  "claim",
  "response",
  "referenced_document",
] as const;

export const memoAnalysisSchema = z.object({
  matter_summary: z.object({ text: z.string(), citations: z.array(citation) }),
  facts: z.array(z.object({ category: z.enum(FACT_CATEGORIES), text: z.string(), citations: z.array(citation) })),
  missing_information: z.array(
    z.object({ kind: z.enum(["missing", "unclear", "contradictory"]), text: z.string(), citations: z.array(citation) }),
  ),
  legal_issues: z.array(z.object({ issue: z.string(), rationale: z.string(), citations: z.array(citation) })),
  research_questions: z.array(z.object({ question: z.string() })),
  relevant_documents: z.array(z.object({ source_id: z.string(), relevance: z.string() })),
  analysis_structure: z.array(z.object({ heading: z.string(), points: z.array(z.string()) })),
});

export const memoDraftSchema = z.object({
  sections: z.array(z.object({ heading: z.string(), body: z.string() })),
});

export type ModelCitation = z.infer<typeof citation>;
export type MemoAnalysisOutput = z.infer<typeof memoAnalysisSchema>;
export type MemoDraftOutput = z.infer<typeof memoDraftSchema>;
