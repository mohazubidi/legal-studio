import { z } from "zod/v4";
import { modelCitationSchema } from "@/lib/tools/shared/model-citation";

/**
 * What the model returns for a CaseMap. Items reference each other by short
 * keys (P1, C1, …) that the server maps to ids; unknown keys are dropped.
 * Fields named `supports` and `interpretation` are AI interpretation; every
 * other text field is extraction and must be backed by citations.
 */
const citations = z.array(modelCitationSchema);

export const EVIDENCE_TYPES = ["contract", "correspondence", "financial", "official_record", "statement", "expert", "other"] as const;

/** A date exactly as the source states it; conversion and sorting happen on the server. */
const statedDate = z.object({
  text: z.string(),
  calendar: z.enum(["gregorian", "hijri", "unknown"]),
  year: z.number().int(),
  month: z.number().int(),
  day: z.number().int(),
});

export const caseMapSchema = z.object({
  parties: z.array(z.object({ key: z.string(), name: z.string(), role: z.string(), citations })),
  claims: z.array(
    z.object({
      key: z.string(),
      title: z.string(),
      claimant_keys: z.array(z.string()),
      respondent_keys: z.array(z.string()),
      citations,
      positions: z.array(z.object({ party_key: z.string(), position: z.string(), citations })),
    }),
  ),
  events: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      date: statedDate,
      party_keys: z.array(z.string()),
      claim_keys: z.array(z.string()),
      citations,
    }),
  ),
  evidence: z.array(
    z.object({
      evidence_type: z.enum(EVIDENCE_TYPES),
      description: z.string(),
      supports: z.string(),
      claim_keys: z.array(z.string()),
      party_keys: z.array(z.string()),
      citations,
    }),
  ),
  contradictions: z.array(
    z.object({
      kind: z.enum(["date", "amount", "fact", "statement"]),
      topic: z.string(),
      statements: z.array(z.object({ text: z.string(), citations })),
      interpretation: z.string(),
    }),
  ),
  missing_information: z.array(
    z.object({ kind: z.enum(["missing", "unclear"]), text: z.string(), claim_keys: z.array(z.string()), citations }),
  ),
});

export type CaseMapOutput = z.infer<typeof caseMapSchema>;
export type StatedDate = z.infer<typeof statedDate>;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];
