"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";

const ROLES = ["student", "teacher", "admin"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function back(kind: "notice" | "error", message: string): never {
  redirect(`/users?${kind}=${encodeURIComponent(message)}`);
}

// Only an admin may call this; the database function checks again.
export async function setRole(formData: FormData) {
  const { supabase, user } = await requireAdmin();
  const target = String(formData.get("target") ?? "");
  const role = String(formData.get("role") ?? "");
  const name = String(formData.get("name") ?? "the account");

  if (!UUID.test(target) || !ROLES.includes(role)) back("error", "That request was not valid.");
  if (target === user.id) back("error", "You cannot change your own role.");

  const { error } = await supabase.rpc("set_role", { target, new_role: role });
  if (error) back("error", `The role was not changed: ${error.message}`);
  back("notice", `${name} is now ${role}.`);
}
