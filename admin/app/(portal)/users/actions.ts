"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";

const ROLES = ["student", "teacher", "admin"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

// Every result goes back as a short code; the pages map codes to fixed copy,
// so no message ever repeats text from the address bar.
function back(params: Record<string, string>, path = "/users"): never {
  redirect(`${path}?${new URLSearchParams(params).toString()}`);
}

function target(formData: FormData): string {
  const id = String(formData.get("target") ?? "");
  if (!UUID.test(id)) back({ error: "invalid" });
  return id;
}

// Only an admin may call these; the database checks again in each case.
export async function setRole(formData: FormData) {
  const { supabase, user } = await requireAdmin();
  const id = target(formData);
  const role = String(formData.get("role") ?? "");

  if (!ROLES.includes(role)) back({ error: "invalid" });
  if (id === user.id) back({ error: "self" });

  const { error } = await supabase.rpc("set_role", { target: id, new_role: role });
  if (error) {
    console.error("set_role failed:", error.message);
    back({ error: "failed" });
  }
  back({ notice: "role-changed", id, to: role });
}

// A new account goes through Supabase's normal sign-up, sent on its own (no
// cookies), so the admin stays signed in; the database then files it as a
// student, as for any sign-up, and the chosen role is set straight after.
export async function createAccount(formData: FormData) {
  const { supabase } = await requireAdmin();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "");

  if (!fullName || fullName.length > 120 || !EMAIL.test(email) || !ROLES.includes(role)) back({ error: "invalid-account" });
  if (password.length < MIN_PASSWORD) back({ error: "short-password" });

  let response: Response;
  try {
    response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/signup`, {
      method: "POST",
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        data: { full_name: fullName, requested_role: role === "teacher" ? "teacher" : "student" },
      }),
    });
  } catch (e) {
    console.error("sign-up failed:", (e as Error).message);
    back({ error: "unreachable" });
  }
  const body = (await response.json().catch(() => ({}))) as { code?: string; msg?: string; user?: { id?: string }; id?: string };
  if (!response.ok) {
    if (body.code === "user_already_exists" || /already registered/i.test(body.msg ?? "")) back({ error: "email-taken" });
    if (body.code === "weak_password") back({ error: "short-password" });
    console.error("sign-up refused:", response.status, body.code ?? body.msg);
    back({ error: "create-failed" });
  }
  // With email confirmation off the reply holds a session and the user; with it on, the user alone.
  const id = body.user?.id ?? body.id;
  if (!id || !UUID.test(id)) back({ error: "create-failed" });

  if (role !== "student") {
    const { error } = await supabase.rpc("set_role", { target: id, new_role: role });
    if (error) {
      console.error("set_role after sign-up failed:", error.message);
      back({ error: "created-not-promoted", id });
    }
  }
  back({ notice: "account-created", id });
}

export async function renameAccount(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = target(formData);
  const fullName = String(formData.get("full_name") ?? "").trim();
  if (!fullName || fullName.length > 120) back({ error: "invalid-name" }, `/users/${id}`);

  const { data, error } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", id).select("id");
  if (error || !data?.length) {
    console.error("rename failed:", error?.message ?? "no row changed");
    back({ error: "rename-failed" }, `/users/${id}`);
  }
  back({ notice: "renamed" }, `/users/${id}`);
}

export async function setAccountPassword(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = target(formData);
  const password = String(formData.get("password") ?? "");
  if (password.length < MIN_PASSWORD) back({ error: "short-password" }, `/users/${id}`);

  const { error } = await supabase.rpc("admin_set_password", { target: id, new_password: password });
  if (error) {
    console.error("admin_set_password failed:", error.message);
    back({ error: "password-failed" }, `/users/${id}`);
  }
  back({ notice: "password-set" }, `/users/${id}`);
}

// Deleting an account deletes everything it synced; the database refuses to
// delete the admin's own account or another admin's.
export async function deleteAccount(formData: FormData) {
  const { supabase, user } = await requireAdmin();
  const id = target(formData);
  if (id === user.id) back({ error: "self-delete" }, `/users/${id}`);

  const { error } = await supabase.rpc("admin_delete_user", { target: id });
  if (error) {
    console.error("admin_delete_user failed:", error.message);
    back({ error: /another role/.test(error.message) ? "delete-admin" : "delete-failed" }, `/users/${id}`);
  }
  back({ notice: "account-deleted" });
}
