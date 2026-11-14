import type { ReactNode } from "react";
import { Brand } from "@/components/layout/brand";
import { APP_TAGLINE, LEGAL_DISCLAIMER } from "@/config/constants";
import { PROVENANCE, PROVENANCE_ORDER } from "@/config/provenance";

/** Reads env at request time so a runtime-configured deployment is detected. */
export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(0,560px)]">
      <section className="hidden flex-col justify-between border-e border-border bg-primary px-12 py-10 text-primary-foreground lg:flex">
        <p lang="en" className="text-sm font-semibold tracking-[0.2em] opacity-80">
          LEGAL STUDIO
        </p>
        <div className="max-w-lg">
          <h2 className="text-3xl font-semibold leading-[1.6]">أدوات تنظم العمل القانوني، والحكم للمختص.</h2>
          <p className="mt-4 text-sm leading-7 opacity-80">{APP_TAGLINE}</p>
          <ul className="mt-8 space-y-2 text-sm opacity-90">
            {PROVENANCE_ORDER.map((type) => (
              <li key={type} className="flex items-center gap-3">
                <span className="h-px w-6 bg-current opacity-50" aria-hidden />
                {PROVENANCE[type].labelAr}
              </li>
            ))}
          </ul>
        </div>
        <p className="max-w-lg text-xs leading-6 opacity-70">{LEGAL_DISCLAIMER}</p>
      </section>

      <section className="flex flex-col justify-center px-6 py-10 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-10">
            <Brand />
          </div>
          {children}
        </div>
      </section>
    </div>
  );
}
