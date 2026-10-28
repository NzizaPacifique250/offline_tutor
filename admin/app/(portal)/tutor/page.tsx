import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Table, Td } from "@/components/table";
import { requireStaff } from "@/lib/auth";
import { lessonTitle } from "@/lib/curriculum";
import { allRows } from "@/lib/query";
import { formatMs, percentile } from "@/lib/stats";
import { OUTCOMES, type GuidanceEvent } from "@/lib/types";

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

const timingHead = ["Generated", "First token median", "First token 95th", "Total median", "Total 95th"];

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

export default async function TutorPage() {
  const { supabase } = await requireStaff();
  const events = await allRows<Row>((from, to) =>
    supabase
      .from("guidance_events")
      .select("lesson_id, outcome, first_token_ms, total_ms")
      .order("created_at", { ascending: true })
      .range(from, to),
  );

  const generated = events.data.filter((e) => e.outcome === "generated");
  const lessonIds = [...new Set(generated.map((e) => e.lesson_id))];

  return (
    <>
      <PageHeader
        title="Tutor performance"
        description="First token is the wait before the answer starts to appear. Percentiles use only requests that generated a reply."
        problem={events.problem}
      />

      <Section title="Requests by outcome">
        <Table
          caption="Tutor requests by outcome"
          head={["Outcome", "Requests"]}
          empty="No tutor requests yet."
          isEmpty={events.data.length === 0}
        >
          {OUTCOMES.map((outcome) => (
            <tr key={outcome}>
              <Td>{outcome}</Td>
              <Td numeric>{events.data.filter((e) => e.outcome === outcome).length}</Td>
            </tr>
          ))}
        </Table>
      </Section>

      <Section title="Response time, all lessons">
        <Table
          caption="Response time for generated replies, all lessons"
          head={timingHead}
          empty="No generated replies yet."
          isEmpty={generated.length === 0}
        >
          <tr>
            <TimingCells t={timings(generated)} />
          </tr>
        </Table>
      </Section>

      <Section title="Response time by lesson">
        <Table
          caption="Response time for generated replies, by lesson"
          head={["Lesson", ...timingHead]}
          empty="No generated replies yet."
          isEmpty={generated.length === 0}
        >
          {lessonIds.map((id) => (
            <tr key={id ?? "none"}>
              <Td>{lessonTitle(id)}</Td>
              <TimingCells t={timings(generated.filter((e) => e.lesson_id === id))} />
            </tr>
          ))}
        </Table>
      </Section>
    </>
  );
}
