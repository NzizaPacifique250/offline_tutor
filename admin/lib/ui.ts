import type { IconName } from "@/components/icons";
import type { Tone } from "@/components/badge";
import type { Role } from "@/lib/types";

export type OutcomeMeta = { label: string; tone: Tone; icon: IconName; fill: string };

export const OUTCOME_META: Record<string, OutcomeMeta> = {
  generated: { label: "Generated", tone: "ok", icon: "check", fill: "bg-chart-ok" },
  stored: { label: "Stored", tone: "info", icon: "info", fill: "bg-chart-info" },
  declined: { label: "Declined", tone: "warn", icon: "alert", fill: "bg-chart-warn" },
  cancelled: { label: "Cancelled", tone: "neutral", icon: "dot", fill: "bg-chart-neutral" },
  "timed-out": { label: "Timed out", tone: "warn", icon: "clock", fill: "bg-chart-violet" },
  failed: { label: "Failed", tone: "bad", icon: "x", fill: "bg-chart-bad" },
  "no-model": { label: "No model", tone: "bad", icon: "alert", fill: "bg-chart-dark" },
};

const FALLBACK_OUTCOME: OutcomeMeta = { label: "Unknown", tone: "neutral", icon: "dot", fill: "bg-chart-neutral" };

export function outcomeMeta(outcome: string): OutcomeMeta {
  return OUTCOME_META[outcome] ?? { ...FALLBACK_OUTCOME, label: capitalise(outcome) };
}

export function capitalise(text: string): string {
  return text ? text[0]!.toUpperCase() + text.slice(1) : text;
}

export function roleTone(role: Role): Tone {
  return role === "student" ? "neutral" : "info";
}

export type VerdictMeta = { label: string; tone: Tone; icon: IconName };

// Verdicts the tablet sends: correct, wrong, unsupported, empty. A wrong answer is
// part of learning, so it is amber; red is kept for system failures.
export function verdictMeta(verdict: string): VerdictMeta {
  switch (verdict) {
    case "correct":
      return { label: "Correct", tone: "ok", icon: "check" };
    case "wrong":
      return { label: "Wrong", tone: "warn", icon: "x" };
    case "unsupported":
      return { label: "Could not be checked", tone: "neutral", icon: "info" };
    case "empty":
      return { label: "Empty", tone: "neutral", icon: "dot" };
    default:
      return { label: capitalise(verdict) || "Unknown", tone: "neutral", icon: "dot" };
  }
}

// Up to two letters from the name, else the first two characters of the code.
export function initials(name: string, code: string): string {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return letters || code.slice(0, 2).toUpperCase();
}
