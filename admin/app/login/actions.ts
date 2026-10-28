"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Errors go back to the page as short codes; the page maps them to fixed copy.
export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) redirect("/login?error=missing");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // 400 is a wrong email or password; anything else is a problem on our side.
    redirect(error.status === 400 ? "/login?error=invalid" : "/login?error=unavailable");
  }
  redirect("/");
}
