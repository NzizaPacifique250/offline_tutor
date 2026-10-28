import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { Badge } from "@/components/badge";
import { Pips } from "@/components/bars";
import { Card } from "@/components/card";
import { Icon } from "@/components/icons";
import { LocalTime } from "@/components/local-time";
import { PageHeader } from "@/components/page-header";
import { Rise } from "@/components/rise";
import { Ring } from "@/components/ring";
import { Section } from "@/components/section";
import { StatCard } from "@/components/stat";
import { Table, Td } from "@/components/table";
import { requireStaff } from "@/lib/auth";
import { LESSONS, exerciseLabel, lessonTitle } from "@/lib/curriculum";
import { allRows, firstProblem, rows } from "@/lib/query";
import { TOTAL_EXERCISES, formatMs } from "@/lib/stats";
import type { Attempt, GuidanceEvent, OverviewRow } from "@/lib/types";
import { capitalise, initials, outcomeMeta, roleTone, verdictMeta } from "@/lib/ui";

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
  const name = user.full_name || "(no name)";
  const shownName = user.full_name || user.learner_code;

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link href="/users" className="inline-flex items-center gap-1 text-sm text-muted transition-colors duration-150 hover:text-primary">
            <Icon name="back" size={16} />
            All users
          </Link>
        }
        avatar={<Avatar initials={initials(user.full_name, user.learner_code)} size={48} />}
        title={name}
        badges={<Badge tone={roleTone(user.role)}>{capitalise(user.role)}</Badge>}
        description={`Code ${user.learner_code}`}
        problem={problem}
        kigaliTime
      />

      <div className="grid gap-4 md:gap-6 lg:grid-cols-12">
        <Rise className="lg:col-span-5">
          <Card className="h-full">
            <div className="flex items-center gap-5">
              <Ring
                part={correctIds.size}
                total={TOTAL_EXERCISES}
                stroke="stroke-primary"
                label={`${correctIds.size} of ${TOTAL_EXERCISES} exercises answered correctly`}
              />
              <div>
                <p className="text-[2rem] leading-[1.1] font-semibold tabular-nums">
                  {correctIds.size} of {TOTAL_EXERCISES}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {correctIds.size > 0 ? "exercises answered correctly" : "No exercises answered correctly yet."}
                </p>
              </div>
            </div>
          </Card>
        </Rise>
        <Rise i={1} className="lg:col-span-7">
          <dl className="grid h-full grid-cols-2 gap-4">
            <StatCard label="Attempts" value={user.attempts} />
            <StatCard label="Hints shown" value={user.hints} />
            <StatCard label="Solutions shown" value={user.solutions} />
            <StatCard label="Tutor requests" value={user.tutor_requests} />
          </dl>
        </Rise>
      </div>

      <Section title="Progress by lesson">
        <div className="grid gap-4 md:grid-cols-2 md:gap-6">
          {LESSONS.map((l) => {
            const done = l.exerciseIds.filter((e) => correctIds.has(e)).length;
            const total = l.exerciseIds.length;
            return (
              <Card key={l.id}>
                <p className="text-xs font-semibold text-muted">{l.unit}</p>
                <h3 className="mt-1 line-clamp-2 min-h-12 text-base font-semibold">{l.title}</h3>
                <div className="mt-3">
                  <Pips ids={l.exerciseIds} correct={correctIds} />
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-sm tabular-nums">
                    {done} of {total} correct
                  </p>
                  {done === total ? (
                    <Badge tone="ok" icon="check">
                      Complete
                    </Badge>
                  ) : done > 0 ? (
                    <Badge tone="info" icon="clock">
                      In progress
                    </Badge>
                  ) : (
                    <Badge tone="neutral" icon="dot">
                      Not started
                    </Badge>
                  )}
                </div>
                <ul className="sr-only">
                  {l.exerciseIds.map((e) => (
                    <li key={e}>
                      {exerciseLabel(e)}: {correctIds.has(e) ? "correct" : "not yet"}
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      </Section>

      <Section title="Recent attempts">
        <Table
          caption="Recent attempts"
          head={["When", "Exercise", "Answer", "Result", { label: "Hints seen", numeric: true }]}
          empty={{ title: "No attempts yet", body: `${shownName} has not answered an exercise yet.` }}
          isEmpty={attempts.data.length === 0}
        >
          {attempts.data.slice(0, RECENT).map((a, i) => {
            const verdict = verdictMeta(a.verdict);
            return (
              <tr key={i}>
                <Td rowHeader>
                  <LocalTime iso={a.created_at} />
                </Td>
                <Td>
                  {exerciseLabel(a.exercise_id)}
                  <span className="block text-xs text-muted">{lessonTitle(a.lesson_id)}</span>
                </Td>
                <Td>
                  <span className="block max-w-60 truncate font-mono text-[13px]" title={a.answer}>
                    {a.answer}
                  </span>
                </Td>
                <Td>
                  <Badge tone={verdict.tone} icon={verdict.icon}>
                    {verdict.label}
                  </Badge>
                </Td>
                <Td numeric>{a.hints_seen}</Td>
              </tr>
            );
          })}
        </Table>
      </Section>

      <Section title="Recent tutor requests">
        <Table
          caption="Recent tutor requests"
          head={["When", "Question", "Outcome", { label: "First token", numeric: true }, { label: "Total time", numeric: true }]}
          empty={{ title: "No tutor requests yet", body: `${shownName} has not asked the tutor a question yet.` }}
          isEmpty={tutor.data.length === 0}
        >
          {tutor.data.map((g, i) => {
            const outcome = outcomeMeta(g.outcome);
            return (
              <tr key={i}>
                <Td rowHeader>
                  <LocalTime iso={g.created_at} />
                </Td>
                <Td>
                  <span className="line-clamp-2 max-w-90">{g.question}</span>
                </Td>
                <Td>
                  <Badge tone={outcome.tone} icon={outcome.icon}>
                    {outcome.label}
                  </Badge>
                </Td>
                <Td numeric>{formatMs(g.first_token_ms)}</Td>
                <Td numeric>{formatMs(g.total_ms)}</Td>
              </tr>
            );
          })}
        </Table>
      </Section>
    </>
  );
}
