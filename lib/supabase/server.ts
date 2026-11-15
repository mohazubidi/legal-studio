import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getSupabaseEnv, isLocalPreviewEnabled } from "./env";

/** Server-side Supabase client bound to the request cookies. Null when unconfigured. */
export async function createSupabaseServerClient(): Promise<SupabaseClient | null> {
  const env = getSupabaseEnv();
  if (!env) return null;

  const cookieStore = await cookies();
  return createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component: cookies are read-only there.
          // The middleware refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}

export interface WorkspaceProfile {
  fullName: string | null;
  organization: string | null;
  email: string | null;
}

export type SessionState =
  | { kind: "unconfigured" }
  | { kind: "anonymous" }
  | { kind: "preview"; profile: WorkspaceProfile }
  | { kind: "authenticated"; user: User; profile: WorkspaceProfile };

/**
 * Resolves the current session (memoised per request).
 * Uses getUser(), which re-validates the JWT with Supabase rather than trusting the cookie.
 */
export const getSessionState = cache(async (): Promise<SessionState> => {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return isLocalPreviewEnabled()
      ? { kind: "preview", profile: { fullName: "معاينة محلية", organization: "بدون تسجيل دخول", email: null } }
      : { kind: "unconfigured" };
  }

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { kind: "anonymous" };

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("full_name, organization")
    .eq("id", data.user.id)
    .maybeSingle<{ full_name: string | null; organization: string | null }>();

  return {
    kind: "authenticated",
    user: data.user,
    profile: {
      fullName: profileRow?.full_name ?? (data.user.user_metadata?.full_name as string | undefined) ?? null,
      organization: profileRow?.organization ?? null,
      email: data.user.email ?? null,
    },
  };
});
