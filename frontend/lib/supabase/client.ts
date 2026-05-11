import { createBrowserClient } from "@supabase/ssr";

/**
 * Create a Supabase client for use in Client Components.
 * Uses only publishable keys — safe for browser.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
