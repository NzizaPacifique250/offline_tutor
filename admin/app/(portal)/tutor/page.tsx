import { BarList, RangeBars } from "@/components/bars";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Rise } from "@/components/rise";
import { Section } from "@/components/section";
import { Table, Td } from "@/components/table";
import { getClient, requireStaff } from "@/lib/auth";
import { lessonTitle } from "@/lib/curriculum";
import { allRows } from "@/lib/query";
import { formatMs, percentile } from "@/lib/stats";
import { OUTCOMES, type GuidanceEvent } from "@/lib/types";
import { OUTCOME_META } from "@/lib/ui";

type Row = Pick<GuidanceEvent, "lesson_id" | "outcome" | "first_token_ms" | "total_ms">;

function timings(events: Row[]) {
  const first = events.flatMap((e) => (e.first_token_ms === null ? [] : [e.first_token_ms]));
  const total = events.flatMap((e) => (e.total_ms === null ? [] : [e.total_ms]));
  return {
    n: events.length,
    firstMedian: percentile(first, 50),
    firstP95: percentile(first, 95),
    totalMedian: percentile(total, 50),
    totalP95: percentile(total, 95),
  };
}

const timingHead = [
  { label: "Replies", numeric: true },
  { label: "Starts, median", numeric: true },
  { label: "Starts, slowest 1 in 20", numeric: true },
  { label: "Finishes, median", numeric: true },
  { label: "Finishes, slowest 1 in 20", numeric: true },
] as const;

function TimingCells({ t }: { t: ReturnType<typeof timings> }) {
  return (
    <>
      <Td numeric>{t.n}</Td>
      <Td numeric>{formatMs(t.firstMedian)}</Td>
      <Td numeric>{formatMs(t.firstP95)}</Td>
      <Td numeric>{formatMs(t.totalMedian)}</Td>
      <Td numeric>{formatMs(t.totalP95)}</Td>
    </>
  );
}

const NO_REPLIES = { title: "No generated replies yet", body: "Response times appear after the tutor writes its first answer on a tablet." };

export default async function TutorPage() {
  const supabase = await getClient();
  // The query starts together with the staff check, not after it.
  const [, events] = await Promise.all([
    requireStaff(),
    allRows<Row>((from, to) =>
      supabase
        .from("guidance_events")
        .select("lesson_id, outcome, first_token_ms, total_ms")
        .order("created_at", { ascending: true })
        .range(from, to),
    ),
  ]);

  const generated = events.data.filter((e) => e.outcome === "generated");
  const lessonIds = [...new Set(generated.map((e) => e.lesson_id))];
  const overall = timings(generated);
  const byLesson = lessonIds.map((id) => ({ id, t: timings(generated.filter((e) => e.lesson_id === id)) }));

  const segments = OUTCOMES.map((o) => ({
    key: o,
    label: OUTCOME_META[o]?.label ?? o,
    count: events.data.filter((e) => e.outcome === o).length,
    fill: OUTCOME_META[o]?.fill ?? "bg-chart-neutral",
  }));

  return (
    <>
      <PageHeader
        title="Tutor"
        description="How long a student waits for the tutor on the tablet. Times use only requests where the tutor wrote an answer."
        problem={events.problem}
      />

      <div className="grid gap-4 md:gap-6 lg:grid-cols-12">
        <Rise className="lg:col-span-6">
          <section aria-label="Time until the answer starts, median" className="h-full rounded-xl border border-line bg-surface p-6 shadow-card lg:p-8">
            <p className="text-xs font-semibold text-muted">Time until the answer starts, median</p>
            <p className="mt-2 text-[2.5rem] leading-none font-semibold text-primary tabular-nums sm:text-display">
              {formatMs(overall.firstMedian)}
            </p>
            <p className="mt-4 text-sm text-ink-2">
              Slowest 1 in 20: {formatMs(overall.firstP95)}. Based on {overall.n} {overall.n === 1 ? "reply" : "replies"}.
            </p>
          </section>
        </Rise>
        <Rise i={1} className="lg:col-span-6">
          <section aria-label="Time to finish, median" className="h-full rounded-xl border border-line bg-surface p-6 shadow-card lg:p-8">
            <p className="text-xs font-semibold text-muted">Time to finish, median</p>
            <p className="mt-2 text-[2.5rem] leading-none font-semibold text-primary tabular-nums sm:text-display">
              {formatMs(overall.totalMedian)}
            </p>
            <p className="mt-4 text-sm text-ink-2">
              Slowest 1 in 20: {formatMs(overall.totalP95)}. Based on {overall.n} {overall.n === 1 ? "reply" : "replies"}.
            </p>
          </section>
        </Rise>
      </div>

      <div className="mt-4 grid gap-4 md:mt-6 md:gap-6 lg:grid-cols-12">
        <Rise i={2} className="lg:col-span-5">
          <Card title="Requests by outcome" className="h-full">
            {events.data.length === 0 ? (
              <EmptyState
                compact
                title="No tutor requests yet"
                body="They appear when a student asks the tutor a question and the tablet syncs."
              />
            ) : (
              <BarList segments={segments} />
            )}
          </Card>
        </Rise>
        <Rise i={3} className="lg:col-span-7">
          <Card title="Time to finish, by lesson" className="h-full">
            {generated.length === 0 ? (
              <EmptyState compact {...NO_REPLIES} />
            ) : (
              <RangeBars
                rows={byLesson.map(({ id, t }) => ({
                  key: id ?? "none",
                  label: lessonTitle(id),
                  median: t.totalMedian,
                  p95: t.totalP95,
                }))}
              />
            )}
          </Card>
        </Rise>
      </div>

      <Section title="Exact times by lesson">
        <Table
          caption="Time until the answer starts and time to finish, by lesson"
          head={["Lesson", ...timingHead]}
          empty={NO_REPLIES}
          isEmpty={generated.length === 0}
        >
          {byLesson.map(({ id, t }) => (
            <tr key={id ?? "none"}>
              <Td rowHeader>{lessonTitle(id)}</Td>
              <TimingCells t={t} />
            </tr>
          ))}
        </Table>
      </Section>

      <p className="mt-6 max-w-2xl text-xs text-muted">
        Technical terms: the time until the answer starts is the first-token time. The slowest 1 in 20 is the 95th
        percentile. The median is the middle value, so half of the replies were faster.
      </p>
    </>
  );
}
