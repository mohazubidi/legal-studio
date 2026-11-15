import { z } from "zod/v4";

/** A date exactly as the source states it. Conversion and sorting happen on the server. */
export const statedDateSchema = z.object({
  text: z.string(),
  calendar: z.enum(["gregorian", "hijri", "unknown"]),
  year: z.number().int(),
  month: z.number().int(),
  day: z.number().int(),
});

export type StatedDate = z.infer<typeof statedDateSchema>;
