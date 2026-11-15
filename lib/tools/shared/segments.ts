import { z } from "zod";
import type { DocumentSegment, Json } from "@/types/database";

const segmentsSchema = z.array(z.object({ id: z.string(), label: z.string(), text: z.string() }));

/** Reads documents.segments defensively (it is jsonb). */
export function parseSegmentsValue(value: Json | null): DocumentSegment[] {
  const parsed = segmentsSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}
