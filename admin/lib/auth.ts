import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export const getSession = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { supabase, user: null, profile: null, error: null };
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, role, requested_role, full_name, learner_code, created_at")
    .eq("id", data.user.id)
    .maybeSingle();
  return {
    supabase,
    user: data.user,
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
