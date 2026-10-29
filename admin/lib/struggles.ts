import { exerciseLabel } from "@/lib/curriculum";
import type { ExerciseProgress } from "@/lib/types";

// Two or more wrong answers on one exercise is a struggle; while the
// exercise is still unsolved the student is stuck (the app's "needs help").
export const STRUGGLE_WRONG = 2;

export type ProgressRow = Pick<ExerciseProgress, "user_id" | "exercise_id" | "wrong" | "solved" | "stuck" | "last_attempt_at">;

export type StudentStruggles = {
  userId: string;
  wrong: number;
  stuck: number;
  struggled: number;
  // Exercises answered wrongly at least once: stuck first, then by wrong answers.
  exercises: ProgressRow[];
};

const order = (a: ProgressRow, b: ProgressRow) =>
  Number(b.stuck) - Number(a.stuck) || b.wrong - a.wrong || b.last_attempt_at.localeCompare(a.last_attempt_at);

// Per student, from exercise_progress rows (any row with a wrong answer).
export function struggles(rows: ProgressRow[]): Map<string, StudentStruggles> {
  const by = new Map<string, StudentStruggles>();
  for (const r of rows) {
    if (r.wrong < 1) continue;
    const s = by.get(r.user_id) ?? { userId: r.user_id, wrong: 0, stuck: 0, struggled: 0, exercises: [] };
    s.wrong += r.wrong;
    if (r.stuck) s.stuck += 1;
    else if (r.wrong >= STRUGGLE_WRONG) s.struggled += 1;
    s.exercises.push(r);
    by.set(r.user_id, s);
  }
  for (const s of by.values()) s.exercises.sort(order);
  return by;
}

// Most in need first: stuck, then struggled, then the most wrong answers.
export function ranked(by: Map<string, StudentStruggles>): StudentStruggles[] {
  return [...by.values()].sort((a, b) => b.stuck - a.stuck || b.struggled - a.struggled || b.wrong - a.wrong);
}

export const isStruggling = (s: StudentStruggles | undefined) => Boolean(s && (s.stuck > 0 || s.struggled > 0));

// "Activity 1.7, question 2: 3 wrong, solved later"
export function describe(r: ProgressRow): string {
  const state = r.stuck ? "not solved yet" : r.solved ? "solved later" : "not solved yet";
  return `${exerciseLabel(r.exercise_id)}: ${r.wrong} wrong, ${state}`;
}
