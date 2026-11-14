import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { SetupRequired } from "@/components/layout/setup-required";
import { getSessionState } from "@/lib/supabase/server";

/** Session-dependent: never prerender, whether or not env vars exist at build time. */
export const dynamic = "force-dynamic";

/**
 * Protected workspace boundary. The middleware redirects early; this layout
 * re-verifies on the server so no workspace page renders without a valid user.
 */
export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const session = await getSessionState();

  if (session.kind === "unconfigured") return <SetupRequired />;
  if (session.kind === "anonymous") redirect("/login");

  return <AppShell profile={session.profile}>{children}</AppShell>;
}
