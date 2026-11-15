export interface SupabaseEnv {
  url: string;
  anonKey: string;
}

/**
 * Reads the public Supabase configuration.
 * Returns null when not configured so callers can render a setup screen
 * instead of silently bypassing authentication.
 */
export function getSupabaseEnv(): SupabaseEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseEnv() !== null;
}

/**
 * Local UI preview without authentication. Only honoured by the dev server
 * (`next dev`) and only while Supabase is NOT configured. A production build
 * ignores it, so it can never bypass real authentication.
 */
export function isLocalPreviewEnabled(): boolean {
  return process.env.NODE_ENV === "development" && process.env.LOCAL_PREVIEW === "1";
}
