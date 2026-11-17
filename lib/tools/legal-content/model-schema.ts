import { z } from "zod/v4";
import { modelCitationSchema } from "@/lib/tools/shared/model-citation";

/**
 * What the model returns. It fills the predefined sections only; the server
 * checks every quote against the source, keeps the section order of the
 * format, and builds the source section itself.
 */
const block = z.object({
  kind: z.enum(["source_quote", "explanation"]),
  text: z.string(),
  citations: z.array(modelCitationSchema),
});

export const contentModelSchema = z.object({
  title: z.string(),
  cards: z.array(z.object({ role: z.string(), heading: z.string(), blocks: z.array(block) })),
});

export type ContentModelOutput = z.infer<typeof contentModelSchema>;
