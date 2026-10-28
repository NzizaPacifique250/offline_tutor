import type { IconName } from "@/components/icons";
import type { Tone } from "@/components/badge";
import { LESSONS } from "@/lib/curriculum";

// Nearest-rank percentile. `values` need not be sorted. Returns null when empty.
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1] ?? null;
}

export function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "–";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
}

export function formatShare(part: number, total: number): string {
  return total === 0 ? "–" : `${Math.round((part / total) * 100)}%`;
}

// ISO timestamp for "n days ago". Kept out of components so renders stay pure.
export function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

// Total exercises in the course, from the generated curriculum.
export const TOTAL_EXERCISES = LESSONS.reduce((sum, l) => sum + l.exerciseIds.length, 0);

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// "just now", "12 min ago", "3 h ago", "2 days ago", or "–".
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "–";
  const age = Date.now() - Date.parse(iso);
  if (Number.isNaN(age)) return "–";
  if (age < MINUTE) return "just now";
  if (age < HOUR) return `${Math.floor(age / MINUTE)} min ago`;
  if (age < DAY) return `${Math.floor(age / HOUR)} h ago`;
  const days = Math.floor(age / DAY);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

export type SyncStatus = { label: string; tone: Tone; icon: IconName; recent: boolean };

export function syncStatus(iso: string | null | undefined): SyncStatus {
  if (!iso) return { label: "Never synced", tone: "neutral", icon: "dot", recent: false };
  const age = Date.now() - Date.parse(iso);
  if (age <= DAY) return { label: "Synced in the last 24 h", tone: "ok", icon: "check", recent: true };
  if (age <= 7 * DAY) return { label: "Synced this week", tone: "info", icon: "info", recent: false };
  return { label: "Not synced for over 7 days", tone: "warn", icon: "alert", recent: false };
}

const KIGALI = "Africa/Kigali";
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: KIGALI, year: "numeric", month: "2-digit", day: "2-digit" });
const dayName = new Intl.DateTimeFormat("en-GB", { timeZone: KIGALI, weekday: "short", day: "numeric", month: "short" });
const clock = new Intl.DateTimeFormat("en-GB", { timeZone: KIGALI, hour: "2-digit", minute: "2-digit", hour12: false });

// "Today", "Yesterday" or "Mon 26 Oct", on the Kigali calendar.
export function kigaliDayLabel(iso: string): string {
  const key = dayKey.format(new Date(iso));
  if (key === dayKey.format(new Date())) return "Today";
  if (key === dayKey.format(new Date(Date.now() - DAY))) return "Yesterday";
  return dayName.format(new Date(iso)).replace(",", "");
}

export function kigaliDayKey(iso: string): string {
  return dayKey.format(new Date(iso));
}

const dateTime = new Intl.DateTimeFormat("en-GB", { timeZone: KIGALI, dateStyle: "medium", timeStyle: "short" });

// "28 Oct 2026, 14:05" on the Kigali clock. Same on server and client, so nothing flickers.
export function kigaliDateTime(iso: string): string {
  return dateTime.format(new Date(iso));
}

export function kigaliClock(iso: string): string {
  return clock.format(new Date(iso));
}

export type DayCount = { label: string; count: number };

// Counts per Kigali calendar day for the last `days` days, oldest first.
export function countByDay(isos: string[], days: number): DayCount[] {
  const now = Date.now();
  const buckets = Array.from({ length: days }, (_, i) => {
    const at = new Date(now - (days - 1 - i) * DAY);
    return { key: dayKey.format(at), label: dayName.format(at).replace(",", ""), count: 0 };
  });
  for (const iso of isos) {
    const bucket = buckets.find((b) => b.key === dayKey.format(new Date(iso)));
    if (bucket) bucket.count += 1;
  }
  return buckets.map(({ label, count }) => ({ label, count }));
}
