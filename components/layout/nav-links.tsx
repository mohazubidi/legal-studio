"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MAIN_NAV, isNavActive } from "@/config/navigation";
import { cn } from "@/lib/utils";

export function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label="التنقل الرئيسي">
      <ul className="space-y-0.5">
        {MAIN_NAV.map((item) => {
          const active = isNavActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors duration-150",
                  active
                    ? "bg-surface-muted font-semibold text-foreground before:absolute before:inset-y-1.5 before:start-0 before:w-[3px] before:rounded-full before:bg-accent"
                    : "text-muted-foreground hover:bg-surface-muted/60 hover:text-foreground",
                )}
              >
                <Icon className={cn("size-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} aria-hidden />
                <span className="flex-1">{item.labelAr}</span>
                <span lang="en" className="text-[11px] text-muted-foreground/80">
                  {item.labelEn}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
