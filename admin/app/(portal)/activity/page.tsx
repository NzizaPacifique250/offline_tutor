import Link from "next/link";
import { LocalTime } from "@/components/local-time";
import { PageHeader } from "@/components/page-header";
import { Table, Td } from "@/components/table";
import { requireStaff } from "@/lib/auth";
import { exerciseLabel, lessonTitle } from "@/lib/curriculum";
import { firstProblem, rows } from "@/lib/query";
import type { Attempt, GuidanceEvent, Reveal, Session } from "@/lib/types";

const LIMIT = 100;

type Event = { key: string; at: string; userId: string; code: string; device: string; kind: string; detail: string };

function clip(text: string, max = 120): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export default async function ActivityPage() {
  const { supabase } = await requireStaff();
  const [sessions, attempts, reveals, guidance] = await Promise.all([
    rows<Session>(supabase.from("sessions").select("*").order("started_at", { ascending: false }).limit(LIMIT)),
    rows<Attempt>(supabase.from("attempts").select("*").order("created_at", { ascending: false }).limit(LIMIT)),
    rows<Reveal>(supabase.from("reveals").select("*").order("created_at", { ascending: false }).limit(LIMIT)),
    rows<GuidanceEvent>(supabase.from("guidance_events").select("*").order("created_at", { ascending: false }).limit(LIMIT)),
  ]);

  const events: Event[] = [
    ...sessions.data.map((s, i) => ({
      key: `s${i}`, at: s.started_at, userId: s.user_id, code: s.learner_code, device: s.device_id,
      kind: "Session started", detail: s.content_versions,
    })),
    ...attempts.data.map((a, i) => ({
      key: `a${i}`, at: a.created_at, userId: a.user_id, code: a.learner_code, device: a.device_id,
      kind: `Attempt (${a.verdict})`, detail: `${exerciseLabel(a.exercise_id)}: ${clip(a.answer, 60)}`,
    })),
    ...reveals.data.map((r, i) => ({
      key: `r${i}`, at: r.created_at, userId: r.user_id, code: r.learner_code, device: r.device_id,
      kind: r.kind === "hint" ? "Hint shown" : "Solution shown",
      detail: `${exerciseLabel(r.exercise_id)} (${lessonTitle(r.lesson_id)})`,
    })),
    ...guidance.data.map((g, i) => ({
      key: `g${i}`, at: g.created_at, userId: g.user_id, code: g.learner_code, device: g.device_id,
      kind: `Tutor (${g.outcome})`, detail: clip(g.question),
    })),
  ]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, LIMIT);

  return (
    <>
      <PageHeader
        title="Activity"
        description={`The latest ${LIMIT} events from sessions, attempts, hints and solutions, and tutor requests.`}
        problem={firstProblem(sessions, attempts, reveals, guidance)}
      />
      <Table
        caption="Latest activity"
        head={["When", "Learner", "Tablet", "Event", "Detail"]}
        empty="No activity yet."
        isEmpty={events.length === 0}
      >
        {events.map((e) => (
          <tr key={e.key}>
            <Td>
              <LocalTime iso={e.at} />
            </Td>
            <Td>
              <Link href={`/users/${e.userId}`} className="text-brand-700 underline">
                {e.code}
              </Link>
            </Td>
            <Td>{e.device.slice(0, 8)}</Td>
            <Td>{e.kind}</Td>
            <Td>{e.detail}</Td>
          </tr>
        ))}
      </Table>
    </>
  );
}
