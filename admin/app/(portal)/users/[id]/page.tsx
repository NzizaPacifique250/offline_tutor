import Link from "next/link";
import { notFound } from "next/navigation";
import { LocalTime } from "@/components/local-time";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Stat } from "@/components/stat";
import { Table, Td } from "@/components/table";
import { requireStaff } from "@/lib/auth";
import { LESSONS, exerciseLabel, lessonTitle } from "@/lib/curriculum";
import { allRows, firstProblem, rows } from "@/lib/query";
import { formatMs } from "@/lib/stats";
import type { Attempt, GuidanceEvent, OverviewRow } from "@/lib/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RECENT = 20;

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { supabase } = await requireStaff();

  const [overview, attempts, tutor] = await Promise.all([
    rows<OverviewRow>(supabase.from("learner_overview").select("*").eq("user_id", id)),
    allRows<Attempt>((from, to) =>
      supabase.from("attempts").select("*").eq("user_id", id).order("created_at", { ascending: false }).range(from, to),
    ),
    rows<GuidanceEvent>(
      supabase.from("guidance_events").select("*").eq("user_id", id).order("created_at", { ascending: false }).limit(RECENT),
    ),
  ]);

  const problem = firstProblem(overview, attempts, tutor);
  const user = overview.data[0];
  if (!user && !problem) notFound();
  if (!user) return <PageHeader title="Account" problem={problem} />;

  const correctIds = new Set(attempts.data.filter((a) => a.verdict === "correct").map((a) => a.exercise_id));

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/users" className="text-brand-700 underline">
          All users
        </Link>
      </p>
      <PageHeader
        title={user.full_name || "(no name)"}
        description={`${user.learner_code}, ${user.role}`}
        problem={problem}
      />
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Attempts" value={user.attempts} />
        <Stat label="Exercises correct" value={user.exercises_correct} />
        <Stat label="Hints shown" value={user.hints} />
        <Stat label="Solutions shown" value={user.solutions} />
        <Stat label="Tutor requests" value={user.tutor_requests} />
      </dl>

      <Section title="Progress by lesson">
        <Table
          caption="Exercises answered correctly per lesson"
          head={["Lesson", "Exercises correct"]}
          empty="No lessons."
          isEmpty={LESSONS.length === 0}
        >
          {LESSONS.map((l) => {
            const done = l.exerciseIds.filter((e) => correctIds.has(e)).length;
            return (
              <tr key={l.id}>
                <Td>{l.title}</Td>
                <Td numeric>
                  {done} of {l.exerciseIds.length}
                </Td>
              </tr>
            );
          })}
        </Table>
      </Section>

      <Section title="Recent attempts">
        <Table
          caption="Recent attempts"
          head={["When", "Exercise", "Answer", "Result", "Hints seen"]}
          empty="No attempts yet."
          isEmpty={attempts.data.length === 0}
        >
          {attempts.data.slice(0, RECENT).map((a, i) => (
            <tr key={i}>
              <Td>
                <LocalTime iso={a.created_at} />
              </Td>
              <Td>
                {exerciseLabel(a.exercise_id)}
                <span className="block text-xs text-slate-600">{lessonTitle(a.lesson_id)}</span>
              </Td>
              <Td>{a.answer}</Td>
              <Td>{a.verdict}</Td>
              <Td numeric>{a.hints_seen}</Td>
            </tr>
          ))}
        </Table>
      </Section>

      <Section title="Recent tutor requests">
        <Table
          caption="Recent tutor requests"
          head={["When", "Question", "Outcome", "First token", "Total time"]}
          empty="No tutor requests yet."
          isEmpty={tutor.data.length === 0}
        >
          {tutor.data.map((g, i) => (
            <tr key={i}>
              <Td>
                <LocalTime iso={g.created_at} />
              </Td>
              <Td>{g.question}</Td>
              <Td>{g.outcome}</Td>
              <Td numeric>{formatMs(g.first_token_ms)}</Td>
              <Td numeric>{formatMs(g.total_ms)}</Td>
            </tr>
          ))}
        </Table>
      </Section>
    </>
  );
}
