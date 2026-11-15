import { z } from "zod/v4";

/**
 * The model only interprets changes the server already computed (by id). It
 * never supplies the previous or new text, locations, or match decisions.
 */
export const AI_CHANGE_TYPES = ["responsibility", "procedural", "deadline", "amount", "definition", "scope", "other"] as const;

export const regDeltaSchema = z.object({
  changes: z.array(
    z.object({
      change_id: z.string(),
      ai_types: z.array(z.enum(AI_CHANGE_TYPES)),
      summary: z.string(),
      significance: z.string(),
      match_assessment: z.string(),
    }),
  ),
  operational_impacts: z.array(z.object({ area: z.string(), description: z.string(), change_ids: z.array(z.string()) })),
  checklist: z.array(z.object({ item: z.string(), change_ids: z.array(z.string()) })),
});

export type RegDeltaOutput = z.infer<typeof regDeltaSchema>;
export type AiChangeType = (typeof AI_CHANGE_TYPES)[number];
