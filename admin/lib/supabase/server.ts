import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// A client that acts as the signed-in user, so row-level security applies.
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (items) => {
          try {
            for (const { name, value, options } of items) cookieStore.set(name, value, options);
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // The proxy refreshes the session, so this is safe to ignore.
          }
        },
      },
    },
  );
}

export type Supabase = Awaited<ReturnType<typeof createClient>>;
