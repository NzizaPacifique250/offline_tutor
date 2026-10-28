import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

// One Supabase client per request, shared by the layout, the page and the
// session check below.
export const getClient = cache(createClient);

// Who is signed in, read from the session token. getClaims checks the token's
// signature against the project's public signing key, which the client keeps
// for the whole server process, so this asks Supabase nothing; every query
// still sends the token, and the database checks it again under row-level
// security. A page starts its own queries alongside requireStaff (see the
// pages' Promise.all), so the profile and the page's data arrive together;
// for an account that is not staff the redirect wins and the rows, which
// row-level security has already limited, are thrown away.
export const getSession = cache(async () => {
  const supabase = await getClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return { supabase, user: null, profile: null, error: null };
  const user = { id: claims.sub, email: typeof claims.email === "string" ? claims.email : "" };
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, role, requested_role, full_name, learner_code, created_at")
    .eq("id", user.id)
    .maybeSingle();
  return {
    supabase,
    user,
    profile: (profile as Profile | null) ?? null,
    error: error ? { code: error.code, message: error.message } : null,
  };
});

// Every portal page calls this: layouts do not re-run on client navigation.
export async function requireStaff() {
  const session = await getSession();
  if (!session.user) redirect("/login");
  if (!session.profile || session.profile.role === "student") redirect("/no-access");
  return { ...session, user: session.user, profile: session.profile };
}

export async function requireAdmin() {
  const session = await requireStaff();
  if (session.profile.role !== "admin") redirect("/");
  return session;
}
