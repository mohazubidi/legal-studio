import { z } from "zod/v4";
import { modelCitationSchema } from "@/lib/tools/shared/model-citation";
import { statedDateSchema } from "@/lib/tools/shared/model-date";

/**
 * What the model returns for one contract. Every value must come from the
 * contract text; the server verifies quotes, clause numbers, dates and amounts
 * against the cited segments and removes anything it cannot find there.
 */
const citations = z.array(modelCitationSchema);

/** A term the contract may or may not state. */
const term = z.object({
  status: z.enum(["stated", "not_stated", "unclear"]),
  summary: z.string(),
  clause_ref: z.string(),
  citations,
});

export const TERM_KEYS = [
  "effective_date",
  "duration",
  "renewal",
  "termination",
  "confidentiality",
  "liability",
  "dispute_resolution",
  "governing_law",
] as const;

export const REVIEW_LABEL_KEYS = ["worth_review", "contractual_effect", "wording_check"] as const;

export const contractSchema = z.object({
  parties: z.array(z.object({ key: z.string(), name: z.string(), role: z.string(), citations })),
  terms: z.object({
    effective_date: term.extend({ date: statedDateSchema }),
    duration: term,
    renewal: term,
    termination: term,
    confidentiality: term,
    liability: term,
    dispute_resolution: term,
    governing_law: term,
  }),
  notice_periods: z.array(z.object({ purpose: z.string(), period_text: z.string(), clause_ref: z.string(), citations })),
  payments: z.array(
    z.object({
      description: z.string(),
      amount_text: z.string(),
      currency: z.string(),
      due_text: z.string(),
      due_date: statedDateSchema,
      clause_ref: z.string(),
      citations,
    }),
  ),
  obligations: z.array(
    z.object({
      description: z.string(),
      responsible_party_keys: z.array(z.string()),
      deadline_text: z.string(),
      deadline_date: statedDateSchema,
      clause_ref: z.string(),
      citations,
    }),
  ),
  review_items: z.array(
    z.object({ topic: z.string(), clause_ref: z.string(), note: z.string(), label: z.enum(REVIEW_LABEL_KEYS), citations }),
  ),
  missing_information: z.array(z.object({ kind: z.enum(["missing", "unclear"]), text: z.string(), citations })),
});

export type ContractOutput = z.infer<typeof contractSchema>;
export type TermKey = (typeof TERM_KEYS)[number];
export type ReviewLabelKey = (typeof REVIEW_LABEL_KEYS)[number];
