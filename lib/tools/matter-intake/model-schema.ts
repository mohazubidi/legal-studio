import { z } from "zod/v4";
import { modelCitationSchema } from "@/lib/tools/shared/model-citation";
import { statedDateSchema } from "@/lib/tools/shared/model-date";

/**
 * What the model returns for an intake. Each field says whether it is stated
 * by the client, inferred, unclear, or not provided. Citations must quote the
 * client's own words; the server verifies them.
 */
const citations = z.array(modelCitationSchema);
const status = z.enum(["stated", "inferred", "unclear", "not_provided"]);
const field = z.object({ value: z.string(), status, citations });

export const ANSWER_TYPES = ["text", "date", "amount", "yes_no", "document"] as const;

export const intakeBriefSchema = z.object({
  summary: z.object({ text: z.string(), citations }),
  client: field,
  relationship: field,
  matter_type: field,
  requested_outcome: field,
  other_parties: z.array(z.object({ name: z.string(), role: z.string(), status, citations })),
  key_events: z.array(z.object({ description: z.string(), date: statedDateSchema, status, citations })),
  dates: z.array(z.object({ label: z.string(), date: statedDateSchema, citations })),
  amounts: z.array(z.object({ label: z.string(), amount_text: z.string(), currency: z.string(), citations })),
  documents_mentioned: z.array(z.object({ description: z.string(), provided: z.boolean(), citations })),
  missing_information: z.array(z.object({ text: z.string() })),
  missing_documents: z.array(z.object({ document: z.string(), reason: z.string() })),
  contradictions: z.array(z.object({ topic: z.string(), statements: z.array(z.object({ text: z.string(), citations })) })),
  clarification_questions: z.array(z.object({ question: z.string(), reason: z.string() })),
  questionnaire: z.array(
    z.object({ section: z.string(), questions: z.array(z.object({ question: z.string(), purpose: z.string(), answer_type: z.enum(ANSWER_TYPES) })) }),
  ),
});

export type IntakeBriefOutput = z.infer<typeof intakeBriefSchema>;
