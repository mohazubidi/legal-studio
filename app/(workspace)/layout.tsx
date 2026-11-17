import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { SetupRequired } from "@/components/layout/setup-required";
import { getSessionState } from "@/lib/supabase/server";

/** Session-dependent: never prerender, whether or not env vars exist at build time. */
export const dynamic = "force-dynamic";

/**
 * No loading.tsx anywhere in the workspace, on purpose: a loading boundary above
 * or at the dynamic [matterId] / [outputId] pages made Next.js 15.5 sometimes drop
 * the refreshed page that a server action returns, leaving the UI stale until a
 * reload (reproduced on production builds, at the workspace and at output pages).
 *
 * Protected workspace boundary. The middleware redirects early; this layout
 * re-verifies on the server so no workspace page renders without a valid user.
 */
export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const session = await getSessionState();

  if (session.kind === "unconfigured") return <SetupRequired />;
  if (session.kind === "anonymous") redirect("/login");
  if (session.kind === "preview") {
    return (
      <AppShell profile={session.profile}>
        <p role="status" className="mb-6 rounded-md border border-missing/30 bg-missing-soft px-4 py-2 text-sm text-missing">
          وضع المعاينة المحلية: لا يوجد تسجيل دخول حقيقي، والبيانات المعروضة تجريبية. يعمل على خادم التطوير فقط.
        </p>
        {children}
      </AppShell>
    );
  }

  return <AppShell profile={session.profile}>{children}</AppShell>;
}
