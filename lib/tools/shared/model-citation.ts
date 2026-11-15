import { z } from "zod/v4";

/**
 * Citation shape every tool asks the model for: a source (S1…), a segment of
 * it (p3, s2, t1…) and a quote copied from that segment. The server verifies
 * the quote before the citation is stored (see citations.ts).
 */
export const modelCitationSchema = z.object({
  source_id: z.string(),
  segment_id: z.string(),
  quote: z.string(),
});

export type ModelCitation = z.infer<typeof modelCitationSchema>;
