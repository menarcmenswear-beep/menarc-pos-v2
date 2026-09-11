import { createBrowserClient } from "@supabase/ssr";

// Single client-side Supabase instance for all Client Components.
// Reads the session from cookies (set by the middleware / server client),
// so a logged-in user is actually recognized as "authenticated" by RLS —
// unlike a bare createClient(url, key) which never carries a session.
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. " +
      "Set both in your environment (.env.local locally, Vercel Project Settings in production)."
    );
  }

  return createBrowserClient(url, key);
}
