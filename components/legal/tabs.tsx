"use client";

import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TabItem<K extends string> {
  key: K;
  label: string;
  icon?: LucideIcon;
  count?: number;
}

interface TabsProps<K extends string> {
  label: string;
  items: readonly TabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  children: ReactNode;
}

/**
 * Accessible tabs (WAI-ARIA tabs pattern, automatic activation). Arrow keys
 * follow reading direction in RTL: ArrowLeft moves forward.
 */
export function Tabs<K extends string>({ label, items, value, onChange, children }: TabsProps<K>) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const delta = event.key === "ArrowLeft" ? 1 : event.key === "ArrowRight" ? -1 : 0;
    let next = index + delta;
    if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else if (delta === 0) return;
    event.preventDefault();
    next = (next + items.length) % items.length;
    onChange(items[next].key);
    refs.current[next]?.focus();
  }

  return (
    <div>
      <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto border-b border-border">
        {items.map((item, index) => {
          const active = item.key === value;
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              ref={(el) => {
                refs.current[index] = el;
              }}
              id={`${id}-tab-${item.key}`}
              role="tab"
              type="button"
              aria-selected={active}
              aria-controls={`${id}-panel`}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(item.key)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cn(
                "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors",
                active ? "border-accent font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {Icon ? <Icon className="size-4" aria-hidden /> : null}
              {item.label}
              {item.count !== undefined ? (
                <span className={cn("tabular rounded-full px-1.5 text-[11px]", active ? "bg-primary text-primary-foreground" : "bg-surface-muted")}>
                  {item.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${value}`} tabIndex={0} className="pt-5 focus-visible:outline-none">
        {children}
      </div>
    </div>
  );
}
