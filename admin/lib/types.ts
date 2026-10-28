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
