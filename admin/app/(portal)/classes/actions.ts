"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Results go back as short codes; the page maps them to fixed copy.
function back(params: Record<string, string>): never {
  redirect(`/classes?${new URLSearchParams(params).toString()}`);
}

function id(formData: FormData, field: string): string {
  const value = String(formData.get(field) ?? "");
  if (!UUID.test(value)) back({ error: "invalid" });
  return value;
}

function name(formData: FormData): string {
  const value = String(formData.get("name") ?? "").trim();
  if (!value || value.length > 80) back({ error: "invalid-name" });
  return value;
}

// An empty choice means "no teacher yet".
function teacher(formData: FormData): string | null {
  const value = String(formData.get("teacher_id") ?? "");
  if (!value) return null;
  if (!UUID.test(value)) back({ error: "invalid" });
  return value;
}

// Admins only; the database checks again, and checks that a class's teacher
// is a teacher or an admin and that its members are students.
export async function createClass(formData: FormData) {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from("classes")
    .insert({ name: name(formData), teacher_id: teacher(formData) })
    .select("id")
    .single();
  if (error || !data) {
    console.error("create class failed:", error?.message);
    back({ error: "create-failed" });
  }
  back({ notice: "created", class: data.id });
}

export async function updateClass(formData: FormData) {
  const { supabase } = await requireAdmin();
  const classId = id(formData, "class_id");
  const { data, error } = await supabase
    .from("classes")
    .update({ name: name(formData), teacher_id: teacher(formData) })
    .eq("id", classId)
    .select("id");
  if (error || !data?.length) {
    console.error("update class failed:", error?.message ?? "no row changed");
    back({ error: "update-failed", class: classId });
  }
  back({ notice: "updated", class: classId });
}

export async function deleteClass(formData: FormData) {
  const { supabase } = await requireAdmin();
  const classId = id(formData, "class_id");
  const { data, error } = await supabase.from("classes").delete().eq("id", classId).select("id");
  if (error || !data?.length) {
    console.error("delete class failed:", error?.message ?? "no row deleted");
    back({ error: "delete-failed" });
  }
  back({ notice: "deleted" });
}

export async function addStudent(formData: FormData) {
  const { supabase } = await requireAdmin();
  const classId = id(formData, "class_id");
  const studentId = id(formData, "student_id");
  const { error } = await supabase.from("class_members").insert({ class_id: classId, student_id: studentId });
  if (error) {
    console.error("add student failed:", error.message);
    back({ error: error.code === "23505" ? "already-member" : "add-failed", class: classId });
  }
  back({ notice: "added", class: classId });
}

export async function removeStudent(formData: FormData) {
  const { supabase } = await requireAdmin();
  const classId = id(formData, "class_id");
  const studentId = id(formData, "student_id");
  const { data, error } = await supabase
    .from("class_members")
    .delete()
    .eq("class_id", classId)
    .eq("student_id", studentId)
    .select("student_id");
  if (error || !data?.length) {
    console.error("remove student failed:", error?.message ?? "no row deleted");
    back({ error: "remove-failed", class: classId });
  }
  back({ notice: "removed", class: classId });
}
