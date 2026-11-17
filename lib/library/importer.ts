import { libraryLawSchema, type LibraryLaw } from "./format";

/**
 * The import loop, independent of where files come from and where laws go, so
 * it can be tested without a database. Each law is validated, then written by
 * `upsert` (the library_upsert_law RPC with the service role, in the script).
 * One bad file never stops the others; every outcome is reported.
 */

export type UpsertResult = { id: string; result: "created" | "updated" | "unchanged" };
export type Upsert = (law: LibraryLaw) => Promise<UpsertResult>;

export interface ImportItem {
  /** Where it came from, for the report: file name and index within the file. */
  origin: string;
  value: unknown;
}

export interface ImportOutcome {
  origin: string;
  title: string | null;
  status: "created" | "updated" | "unchanged" | "valid" | "invalid" | "failed";
  message?: string;
}

export interface ImportReport {
  outcomes: ImportOutcome[];
  counts: Record<ImportOutcome["status"], number>;
}

/** A file holds one law object or an array of them. */
export function itemsFromJson(origin: string, text: string): ImportItem[] {
  let value: unknown;
  try {
    value = JSON.parse(text.replace(/^﻿/, ""));
  } catch (error) {
    return [{ origin, value: { __parseError: error instanceof Error ? error.message : String(error) } }];
  }
  return Array.isArray(value) ? value.map((v, i) => ({ origin: `${origin}#${i + 1}`, value: v })) : [{ origin, value }];
}

function describe(issues: { path: (string | number)[]; message: string }[]): string {
  return issues
    .slice(0, 5)
    .map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message))
    .join("؛ ");
}

export async function importLaws(
  items: readonly ImportItem[],
  upsert: Upsert,
  options: { dryRun?: boolean; onOutcome?: (outcome: ImportOutcome) => void } = {},
): Promise<ImportReport> {
  const outcomes: ImportOutcome[] = [];
  const seen = new Map<string, string>();
  const record = (outcome: ImportOutcome) => {
    outcomes.push(outcome);
    options.onOutcome?.(outcome);
  };

  for (const item of items) {
    const value = item.value as { __parseError?: string; title?: unknown } | null;
    if (value && typeof value === "object" && "__parseError" in value) {
      record({ origin: item.origin, title: null, status: "invalid", message: `JSON غير صالح: ${value.__parseError}` });
      continue;
    }
    const parsed = libraryLawSchema.safeParse(item.value);
    const title = typeof value?.title === "string" ? value.title : null;
    if (!parsed.success) {
      record({ origin: item.origin, title, status: "invalid", message: describe(parsed.error.issues) });
      continue;
    }
    const key = `${parsed.data.source}:${parsed.data.external_id}`;
    const earlier = seen.get(key);
    if (earlier) {
      record({ origin: item.origin, title, status: "invalid", message: `المعرّف ${key} مكرر (ورد في ${earlier}).` });
      continue;
    }
    seen.set(key, item.origin);

    if (options.dryRun) {
      record({ origin: item.origin, title: parsed.data.title, status: "valid" });
      continue;
    }
    try {
      const result = await upsert(parsed.data);
      record({ origin: item.origin, title: parsed.data.title, status: result.result });
    } catch (error) {
      record({ origin: item.origin, title: parsed.data.title, status: "failed", message: error instanceof Error ? error.message : String(error) });
    }
  }

  const counts = { created: 0, updated: 0, unchanged: 0, valid: 0, invalid: 0, failed: 0 };
  for (const o of outcomes) counts[o.status] += 1;
  return { outcomes, counts };
}
