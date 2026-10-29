"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// A tablet's install id, a UUID on a real tablet.
const DEVICE_ID = /^[A-Za-z0-9-]{1,64}$/;
// The database's own limits.
const MAX_FILE_BYTES = 2_000_000;
const MAX_NOTES = 500;

// Every result goes back as a short code; the page maps codes to fixed copy.
function back(params: Record<string, string>): never {
  redirect(`/content?${new URLSearchParams(params).toString()}`);
}

function releaseId(formData: FormData): string {
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) back({ error: "invalid" });
  return id;
}

function notesOf(formData: FormData): string {
  const notes = String(formData.get("notes") ?? "").trim();
  if (notes.length > MAX_NOTES) back({ error: "long-notes" });
  return notes;
}

// Every tablet is an empty list; null when "Chosen tablets" was picked with
// none ticked.
function tabletsOf(formData: FormData): string[] | null {
  if (formData.get("audience") !== "chosen") return [];
  const ids = [...new Set(formData.getAll("devices").map(String))];
  if (ids.some((id) => !DEVICE_ID.test(id))) back({ error: "invalid" });
  return ids.length ? ids : null;
}

// The database reads the unit, version and counts from the file itself and
// refuses what is not a lesson package or not a newer version; its messages
// become codes here.
function publishProblem(error: { code?: string; message: string }): string {
  const m = error.message;
  if (error.code === "PGRST205" || error.code === "42P01") return "setup";
  if (error.code === "23505" || /not newer/.test(m)) return "not-newer";
  if (/not valid JSON/.test(m)) return "not-json";
  if (/not a lesson package/.test(m)) return "not-package";
  if (/manifest and lists|no lessons or no exercises/.test(m)) return "incomplete";
  if (/package id/.test(m)) return "bad-id";
  if (/version must be/.test(m)) return "bad-version";
  if (/unit must be/.test(m)) return "bad-unit";
  return "publish-failed";
}

export async function publishRelease(formData: FormData) {
  const { supabase } = await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) back({ error: "no-file" });
  if (file.size > MAX_FILE_BYTES) back({ error: "too-large" });
  const notes = notesOf(formData);
  const devices = tabletsOf(formData);
  if (!devices) back({ error: "no-tablets" });

  const { data, error } = await supabase
    .from("content_releases")
    .insert({ package_text: await file.text(), notes, devices })
    .select("id")
    .single();
  if (error || !data) {
    console.error("publish failed:", error?.message ?? "no row returned");
    back({ error: error ? publishProblem(error) : "publish-failed" });
  }
  back({ notice: "published" });
}

// A published file never changes; its notes and its tablets can.
export async function updateRelease(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = releaseId(formData);
  const notes = notesOf(formData);
  const devices = tabletsOf(formData);
  if (!devices) back({ error: "no-tablets" });

  const { data, error } = await supabase.from("content_releases").update({ notes, devices }).eq("id", id).select("id");
  if (error || !data?.length) {
    console.error("release update failed:", error?.message ?? "no row changed");
    back({ error: "change-failed" });
  }
  back({ notice: "saved" });
}

// Withdrawing stops tablets being offered a release; one that installed it
// keeps it until a newer version comes. Offering it again undoes that.
export async function setWithdrawn(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = releaseId(formData);
  const withdraw = formData.get("withdraw") === "yes";

  const { data, error } = await supabase
    .from("content_releases")
    .update({ withdrawn_at: withdraw ? new Date().toISOString() : null })
    .eq("id", id)
    .select("id");
  if (error || !data?.length) {
    console.error("withdraw failed:", error?.message ?? "no row changed");
    back({ error: "change-failed" });
  }
  back({ notice: withdraw ? "withdrawn" : "restored" });
}
