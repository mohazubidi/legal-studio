import type { CaseMapEvent } from "@/lib/tools/casemap/content";
import type { SourceLink } from "@/lib/tools/casemap/explore";

/** What every view needs to render names and open an item's sources. */
export interface MapLookup {
  partyName: (id: string) => string;
  claimTitle: (id: string) => string;
  links: (referenceIds: string[]) => SourceLink[];
  select: (itemId: string) => void;
}

const gregorian = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
const gregorianMonth = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { year: "numeric", month: "long", timeZone: "UTC" });

/** The date as written, plus the computed Gregorian date when it was converted or only partially stated. */
export function describeDate(date: CaseMapEvent["date"]): { primary: string; secondary: string | null } {
  if (!date.iso) return { primary: date.text || "غير مؤرخ", secondary: null };
  const d = new Date(`${date.iso}T00:00:00Z`);
  const formatted = date.precision === "year" ? date.iso.slice(0, 4) : date.precision === "month" ? gregorianMonth.format(d) : gregorian.format(d);
  if (date.converted) return { primary: date.text || formatted, secondary: `≈ ${formatted} م (محوّل من الهجري)` };
  return { primary: date.text || formatted, secondary: date.text && date.text !== date.iso ? formatted : null };
}
