import type { ReactNode } from "react";
import { Search } from "lucide-react";
import type { WorkspaceProfile } from "@/lib/supabase/server";
import { Brand } from "./brand";
import { DisclaimerBar } from "./disclaimer-bar";
import { MobileNav } from "./mobile-nav";
import { NavLinks } from "./nav-links";
import { UserMenu } from "./user-menu";

export function AppShell({ profile, children }: { profile: WorkspaceProfile; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:start-3 focus:top-3"
      >
        تخطَّ إلى المحتوى
      </a>

      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-e border-border bg-surface lg:flex">
        <div className="border-b border-border px-5 py-4">
          <Brand />
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <NavLinks />
        </div>
        <p className="border-t border-border px-5 py-3 text-[11px] leading-5 text-muted-foreground">
          نموذج تجريبي — Portfolio prototype
        </p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
          <div className="flex h-14 items-center gap-3 px-4 lg:px-8">
            <MobileNav />
            <div className="lg:hidden">
              <Brand />
            </div>
            <div className="relative hidden max-w-md flex-1 sm:block">
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <label htmlFor="global-search" className="sr-only">
                بحث في مساحة العمل
              </label>
              <input
                id="global-search"
                type="search"
                disabled
                placeholder="البحث في الملفات والمستندات (قريبًا)"
                className="h-9 w-full rounded-md border border-border bg-surface-muted/60 ps-9 pe-3 text-sm placeholder:text-muted-foreground disabled:cursor-not-allowed"
              />
            </div>
            <div className="ms-auto">
              <UserMenu profile={profile} />
            </div>
          </div>
          <DisclaimerBar />
        </header>

        <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
