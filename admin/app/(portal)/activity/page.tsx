import Link from "next/link";
import { Badge } from "@/components/badge";
import type { Tone } from "@/components/badge";
import type { IconName } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { Rise } from "@/components/rise";
import { Table, Td } from "@/components/table";
import { getClient, requireStaff } from "@/lib/auth";
import { exerciseLabel, lessonTitle } from "@/lib/curriculum";
import { firstProblem, rows } from "@/lib/query";
import { kigaliClock, kigaliDayKey, kigaliDayLabel } from "@/lib/stats";
import type { Attempt, Device, GuidanceEvent, Reveal, Session } from "@/lib/types";
import { outcomeMeta, verdictMeta } from "@/lib/ui";

const LIMIT = 100;

const GROUPS = [
  { value: "all", label: "All", empty: "events" },
  { value: "attempt", label: "Attempts", empty: "attempts" },
  { value: "reveal", label: "Hints and solutions", empty: "hints or solutions" },
  { value: "tutor", label: "Tutor", empty: "tutor requests" },
  { value: "session", label: "Sessions", empty: "sessions" },
] as const;
type Group = (typeof GROUPS)[number]["value"];

type Event = {
  key: string;
  at: string;
  userId: string;
  code: string;
  device: string;
  group: Exclude<Group, "all">;
  label: string;
  tone: Tone;
  icon: IconName;
  detail: string;
};

function clip(text: string, max = 120): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

type Props = { searchParams: Promise<{ kind?: string }> };

export default async function ActivityPage({ searchParams }: Props) {
  const { kind } = await searchParams;
  const supabase = await getClient();
  // The queries start together with the staff check, not after it.
  const [, sessions, attempts, reveals, guidance, devices] = await Promise.all([
    requireStaff(),
    rows<Session>(supabase.from("sessions").select("*").order("started_at", { ascending: false }).limit(LIMIT)),
    rows<Attempt>(supabase.from("attempts").select("*").order("created_at", { ascending: false }).limit(LIMIT)),
    rows<Reveal>(supabase.from("reveals").select("*").order("created_at", { ascending: false }).limit(LIMIT)),
    rows<GuidanceEvent>(supabase.from("guidance_events").select("*").order("created_at", { ascending: false }).limit(LIMIT)),
    rows<Pick<Device, "id" | "label">>(supabase.from("devices").select("id, label")),
  ]);
  const labelById = new Map(devices.data.map((d) => [d.id, d.label]));

  const events: Event[] = [
    ...sessions.data.map((s, i): Event => ({
      key: `s${i}`, at: s.started_at, userId: s.user_id, code: s.learner_code, device: s.device_id,
      group: "session", label: "Session started", tone: "neutral", icon: "play", detail: s.content_versions,
    })),
    ...attempts.data.map((a, i): Event => {
      const v = verdictMeta(a.verdict);
      return {
        key: `a${i}`, at: a.created_at, userId: a.user_id, code: a.learner_code, device: a.device_id,
        group: "attempt", label: `Attempt: ${v.label}`, tone: v.tone, icon: v.icon,
        detail: `${exerciseLabel(a.exercise_id)}: ${clip(a.answer, 60)}`,
      };
    }),
    ...reveals.data.map((r, i): Event => ({
      key: `r${i}`, at: r.created_at, userId: r.user_id, code: r.learner_code, device: r.device_id,
      group: "reveal",
      label: r.kind === "hint" ? "Hint shown" : "Solution shown",
      tone: r.kind === "hint" ? "info" : "warn",
      icon: r.kind === "hint" ? "hint" : "eye",
      detail: `${exerciseLabel(r.exercise_id)} (${lessonTitle(r.lesson_id)})`,
    })),
    ...guidance.data.map((g, i): Event => {
      const o = outcomeMeta(g.outcome);
      return {
        key: `g${i}`, at: g.created_at, userId: g.user_id, code: g.learner_code, device: g.device_id,
        group: "tutor", label: `Tutor: ${o.label}`, tone: o.tone, icon: o.icon, detail: clip(g.question),
      };
    }),
  ]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, LIMIT);

  const current = GROUPS.find((g) => g.value === kind) ?? GROUPS[0];
  const shown = current.value === "all" ? events : events.filter((e) => e.group === current.value);
  const countFor = (g: Group) => (g === "all" ? events.length : events.filter((e) => e.group === g).length);

  return (
    <>
      <PageHeader
        title="Activity"
        description={`The latest ${LIMIT} events from sessions, attempts, hints and solutions, and tutor requests.`}
        problem={firstProblem(sessions, attempts, reveals, guidance, devices)}
      />
      <Rise>
        <p className="mb-4 text-sm text-muted">
          Showing {shown.length} of the latest {events.length} events. Times are in Kigali time.
        </p>
        <nav aria-label="Filter by event type" className="mb-4 max-w-full overflow-x-auto">
          <div className="inline-flex gap-1 rounded-md bg-tint p-1">
            {GROUPS.map((g) => (
              <Link
                key={g.value}
                href={g.value === "all" ? "/activity" : `/activity?kind=${g.value}`}
                aria-current={g.value === current.value ? "page" : undefined}
                className={`inline-flex h-8 items-center gap-2 rounded-sm px-3 text-sm whitespace-nowrap transition-colors duration-150 ${
                  g.value === current.value
                    ? "bg-surface font-semibold text-primary shadow-card"
                    : "font-medium text-ink-2 hover:bg-tint-strong"
                }`}
              >
                {g.label}
                <span className="text-muted tabular-nums">{countFor(g.value)}</span>
              </Link>
            ))}
          </div>
        </nav>
        <Table
          caption="Latest activity"
          head={["Time (Kigali)", "Learner", "Tablet", "Event", "Detail"]}
          empty={
            events.length === 0
              ? { title: "No activity yet", body: "Events appear here after a tablet syncs." }
              : {
                  title: `No ${current.empty} in the latest ${LIMIT} events`,
                  link: { href: "/activity", label: "Show all events" },
                }
          }
          isEmpty={shown.length === 0}
        >
          {shown.map((e, i) => {
            const previous = shown[i - 1];
            const startsDay = !previous || kigaliDayKey(previous.at) !== kigaliDayKey(e.at);
            return [
              startsDay ? (
                <tr key={`day-${e.key}`}>
                  <th colSpan={5} scope="rowgroup" className="bg-bg px-4 py-2 text-left text-xs font-semibold text-muted">
                    {kigaliDayLabel(e.at)}
                  </th>
                </tr>
              ) : null,
              <tr key={e.key}>
                <Td rowHeader>
                  <time dateTime={e.at} className="tabular-nums">
                    {kigaliClock(e.at)}
                  </time>
                </Td>
                <Td>
                  <Link href={`/users/${e.userId}`} className="link">
                    {e.code}
                  </Link>
                </Td>
                <Td>
                  {labelById.get(e.device) ?? <span className="font-mono text-xs">{e.device.slice(0, 8)}</span>}
                </Td>
                <Td>
                  <Badge tone={e.tone} icon={e.icon}>
                    {e.label}
                  </Badge>
                </Td>
                <Td>
                  <span className="block max-w-xs whitespace-normal text-muted sm:max-w-md sm:truncate" title={e.detail}>
                    {e.detail}
                  </span>
                </Td>
              </tr>,
            ];
          })}
        </Table>
      </Rise>
    </>
  );
}
