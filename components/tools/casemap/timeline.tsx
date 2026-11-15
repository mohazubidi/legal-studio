"use client";

import type { CaseMapEvent } from "@/lib/tools/casemap/content";
import { layoutTimeline } from "@/lib/tools/casemap/explore";
import { cn } from "@/lib/utils";
import { describeDate, type MapLookup } from "./lookup";

const LANES = 3;
const LANE_HEIGHT = 76;

/**
 * Proportional visual timeline. Time runs right-to-left (RTL reading order);
 * points that would overlap are staggered into lanes. Each point is a button
 * that opens the event's sources. The table view carries the same data.
 */
export function Timeline({ events, lookup }: { events: CaseMapEvent[]; lookup: MapLookup }) {
  const layout = layoutTimeline(events, LANES);
  if (layout.points.length === 0) {
    return <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">لا توجد وقائع مؤرخة لعرضها على الخط الزمني.</p>;
  }
  const lanesUsed = Math.max(...layout.points.map((point) => point.lane)) + 1;
  const height = 28 + lanesUsed * LANE_HEIGHT + 12;

  return (
    <figure aria-label="الخط الزمني للوقائع" className="overflow-x-auto rounded-lg border border-border bg-surface">
      <div className="relative mx-20 min-w-[640px]" style={{ height }}>
        <div className="absolute inset-x-0 top-4 h-0.5 bg-border-strong" aria-hidden />
        {layout.points.map(({ event, position, lane }) => {
          const date = describeDate(event.date);
          const referenced = event.provenance === "source";
          return (
            <button
              key={event.id}
              type="button"
              onClick={() => lookup.select(event.id)}
              aria-label={`${date.primary}: ${event.title}${referenced ? "" : " (غير موثّق)"}`}
              className="group absolute top-0 flex w-36 -translate-x-1/2 flex-col items-center focus-visible:outline-none"
              style={{ left: `${(1 - position) * 100}%` }}
            >
              <span
                className={cn(
                  "mt-2.5 size-3.5 rounded-full border-2 border-surface ring-2 transition-transform group-hover:scale-125 group-focus-visible:scale-125",
                  referenced ? "bg-source ring-source/40" : "bg-verify ring-verify/40",
                )}
                aria-hidden
              />
              <span className="w-px bg-border-strong" style={{ height: 6 + lane * LANE_HEIGHT }} aria-hidden />
              <span
                className={cn(
                  "w-full rounded-md border bg-surface px-2 py-1.5 text-center shadow-xs group-hover:border-primary group-focus-visible:ring-2 group-focus-visible:ring-primary",
                  referenced ? "border-border" : "border-dashed border-verify/50",
                )}
              >
                <span className="tabular block text-[11px] font-semibold text-muted-foreground">{date.primary}</span>
                <span className="line-clamp-2 block text-xs leading-5 text-foreground">{event.title}</span>
              </span>
            </button>
          );
        })}
      </div>
      <figcaption className="flex justify-between border-t border-border px-4 py-2 text-xs text-muted-foreground">
        <span className="tabular">{layout.start}</span>
        <span>
          {layout.points.length} واقعة مؤرخة
          {layout.undated.length > 0 ? ` · ${layout.undated.length} بلا تاريخ (في الجدول)` : ""}
        </span>
        <span className="tabular">{layout.end}</span>
      </figcaption>
    </figure>
  );
}
