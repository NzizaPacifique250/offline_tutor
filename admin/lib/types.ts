export type Role = "student" | "teacher" | "admin";

export type Profile = {
  id: string;
  role: Role;
  requested_role: "student" | "teacher";
  full_name: string;
  learner_code: string;
  created_at: string;
};

export type OverviewRow = {
  user_id: string;
  full_name: string;
  learner_code: string;
  role: Role;
  requested_role: "student" | "teacher";
  created_at: string;
  attempts: number;
  exercises_correct: number;
  hints: number;
  solutions: number;
  tutor_requests: number;
  last_activity: string | null;
  // Added by migration 0004; absent until it runs.
  email?: string;
  wrong_answers?: number;
  exercises_stuck?: number;
  tutor_failed?: number;
};

// One student's record on one exercise (view exercise_progress, migration
// 0004). Stuck: two or more wrong answers and none correct.
export type ExerciseProgress = {
  user_id: string;
  lesson_id: string;
  exercise_id: string;
  attempts: number;
  wrong: number;
  solved: boolean;
  hints_seen: number;
  solution_seen: boolean;
  last_attempt_at: string;
  last_wrong_answer: string | null;
  stuck: boolean;
};

export type Device = {
  id: string;
  label: string;
  model: string;
  app_version: string;
  content: string;
  first_seen_at: string;
  last_sync_at: string;
  last_user: string | null;
};

export type Attempt = {
  user_id: string;
  learner_code: string;
  device_id: string;
  lesson_id: string;
  exercise_id: string;
  answer: string;
  verdict: string;
  hints_seen: number;
  created_at: string;
};

export type Reveal = {
  user_id: string;
  learner_code: string;
  device_id: string;
  lesson_id: string;
  exercise_id: string;
  kind: string;
  hint_index: number | null;
  created_at: string;
};

export type Session = {
  user_id: string;
  learner_code: string;
  device_id: string;
  content_versions: string;
  started_at: string;
};

export type GuidanceEvent = {
  user_id: string;
  learner_code: string;
  device_id: string;
  lesson_id: string | null;
  exercise_id: string | null;
  question: string;
  outcome: string;
  text: string;
  prompt_tokens: number | null;
  generated_tokens: number | null;
  first_token_ms: number | null;
  total_ms: number | null;
  created_at: string;
};

export const OUTCOMES = [
  "generated",
  "stored",
  "declined",
  "cancelled",
  "timed-out",
  "failed",
  "no-model",
] as const;

// Migration 0005: a class has a teacher and students.
export type ClassRow = { id: string; name: string; teacher_id: string | null; created_at: string };
export type ClassMember = { class_id: string; student_id: string; added_at: string };
