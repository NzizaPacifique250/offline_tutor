"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";

const ROLES = ["student", "teacher", "admin"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The result goes back as a short code. The page maps codes to fixed copy.
function back(params: Record<string, string>): never {
  redirect(`/users?${new URLSearchParams(params).toString()}`);
}

// Only an admin may call this; the database function checks again.
export async function setRole(formData: FormData) {
  const { supabase, user } = await requireAdmin();
  const target = String(formData.get("target") ?? "");
  const role = String(formData.get("role") ?? "");

  if (!UUID.test(target) || !ROLES.includes(role)) back({ error: "invalid" });
  if (target === user.id) back({ error: "self" });

  const { error } = await supabase.rpc("set_role", { target, new_role: role });
  if (error) {
    console.error("set_role failed:", error.message);
    back({ error: "failed" });
  }
  back({ notice: "role-changed", id: target, to: role });
}
