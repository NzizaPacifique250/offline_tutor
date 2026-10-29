import Link from "next/link";
import { Badge } from "@/components/badge";
import { StackedBar } from "@/components/bars";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { Rise } from "@/components/rise";
import { Ring } from "@/components/ring";
import { StatCard } from "@/components/stat";
import { WeekBars } from "@/components/week-bars";
import { getClient, requireStaff } from "@/lib/auth";
import { allRows, count, firstProblem, rows } from "@/lib/query";
import { countByDay, daysAgoIso, syncStatus, timeAgo } from "@/lib/stats";
import { exerciseLabel } from "@/lib/curriculum";
import { OUTCOMES, type Device, type ExerciseProgress, type Profile } from "@/lib/types";
import { OUTCOME_META } from "@/lib/ui";

export default async function OverviewPage() {
  const supabase = await getClient();
  const since = daysAgoIso(7);
  const head = { count: "exact", head: true } as const;

  // The queries start together with the staff check, not after it.
  const [{ profile: me }, [profiles, devices, attempts, correct, attempts7, tutor7, sessions7, week, outcomes, stuckRows]] = await Promise.all([
    requireStaff(),
    Promise.all([
      rows<Pick<Profile, "id" | "full_name" | "learner_code" | "role" | "requested_role">>(
        supabase.from("profiles").select("id, full_name, learner_code, role, requested_role"),
      ),
      rows<Device>(supabase.from("devices").select("*").order("last_sync_at", { ascending: false })),
      count(supabase.from("attempts").select("*", head)),
      count(supabase.from("attempts").select("*", head).eq("verdict", "correct")),
      count(supabase.from("attempts").select("*", head).gte("created_at", since)),
      count(supabase.from("guidance_events").select("*", head).gte("created_at", since)),
      count(supabase.from("sessions").select("*", head).gte("started_at", since)),
      allRows<{ created_at: string }>(
        (from, to) =>
          supabase.from("attempts").select("created_at").gte("created_at", since).order("created_at").range(from, to),
        5,
      ),
      allRows<{ outcome: string }>((from, to) => supabase.from("guidance_events").select("outcome").order("created_at").order("device_id").order("local_id").range(from, to)),
      rows<Pick<ExerciseProgress, "user_id" | "exercise_id" | "wrong" | "last_attempt_at">>(
        supabase.from("exercise_progress").select("user_id, exercise_id, wrong, last_attempt_at").eq("stuck", true).order("last_attempt_at", { ascending: false }),
      ),
    ]),
  ]);
  const isAdmin = me.role === "admin";

  const problem = firstProblem(profiles, devices, attempts, correct, attempts7, tutor7, sessions7, week, outcomes, stuckRows);
  // Students stuck on at least one exercise, the most recently stuck first.
  const byId = new Map(profiles.data.map((p) => [p.id, p]));
  const needHelp = [...new Set(stuckRows.data.map((r) => r.user_id))].map((id) => {
    const rowsFor = stuckRows.data.filter((r) => r.user_id === id);
    const p = byId.get(id);
    return { id, name: p ? p.full_name || p.learner_code : "Unknown account", exercises: rowsFor.map((r) => exerciseLabel(r.exercise_id)), wrong: rowsFor.reduce((n, r) => n + r.wrong, 0) };
  });
  const roleCount = (role: string) => profiles.data.filter((p) => p.role === role).length;
  const pending = profiles.data.filter((p) => p.role === "student" && p.requested_role === "teacher").length;
  const tutorTotal = outcomes.data.length;
  const syncedRecently = devices.data.filter((d) => syncStatus(d.last_sync_at).recent).length;
  const days = countByDay(week.data.map((a) => a.created_at), 7);

  const segments = OUTCOMES.map((o) => ({
    key: o,
    label: OUTCOME_META[o]?.label ?? o,
    count: outcomes.data.filter((e) => e.outcome === o).length,
    fill: OUTCOME_META[o]?.fill ?? "bg-chart-neutral",
  }));

  return (
    <>
      <PageHeader title="Overview" description="Activity synced from the tablets." problem={problem} />

      <div className="grid gap-4 md:gap-6">
        {isAdmin && pending > 0 ? (
          <Rise>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warn/30 bg-warn-soft px-4 py-3 text-warn">
              <p className="flex items-center gap-2 text-sm font-medium">
                <Icon name="clock" />
                {pending} teacher {pending === 1 ? "request is" : "requests are"} waiting for approval.
              </p>
              <Link href="/users" className="btn btn-secondary">
                Review requests
                <Icon name="arrow" size={16} />
              </Link>
            </div>
          </Rise>
        ) : null}

        <div className="grid gap-4 md:gap-6 lg:grid-cols-12">
          <Rise i={1} className="lg:col-span-8">
            <section
              aria-label="Last 7 days"
              className="on-primary h-full rounded-xl bg-primary p-6 text-white shadow-card lg:p-8"
            >
              <p className="text-xs font-semibold text-white/75">Last 7 days</p>
              <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
                <p className="flex items-baseline gap-3">
                  <span className="text-[2.5rem] leading-none font-semibold tabular-nums sm:text-display">
                    {attempts7.data}
                  </span>
                  <span className="text-lg text-white/85">attempts</span>
                </p>
                {attempts7.data > 0 ? <div className="w-40"><WeekBars days={days} /></div> : null}
              </div>
              {attempts7.data === 0 ? (
                <p className="mt-3 max-w-xl text-base text-white/85">
                  No attempts in the last 7 days. Attempts appear here after a student answers an exercise and the
                  tablet syncs.
                </p>
              ) : null}
              <dl className="mt-6 grid grid-cols-3 gap-4 border-t border-white/20 pt-4">
                {[
                  ["Sessions", sessions7.data],
                  ["Tutor requests", tutor7.data],
                  ["Tablets synced in 24 h", syncedRecently],
                ].map(([label, value]) => (
                  <div key={label} className="flex flex-col-reverse">
                    <dt className="text-xs text-white/85">{label}</dt>
                    <dd className="text-xl font-semibold tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </Rise>

          <Rise i={2} className="lg:col-span-4">
            <Card title="Share correct" className="h-full">
              {attempts.data === 0 ? (
                <p className="text-sm text-muted">
                  No attempts yet. The share correct appears after the first attempt syncs.
                </p>
              ) : (
                <div className="flex items-center gap-4">
                  <Ring
                    part={correct.data}
                    total={attempts.data}
                    label={`${Math.round((correct.data / attempts.data) * 100)} percent correct`}
                  />
                  <p className="text-sm text-ink-2">
                    {correct.data} of {attempts.data} attempts were correct, across all students.
                  </p>
                </div>
              )}
            </Card>
          </Rise>
        </div>

        <Rise i={3}>
          <dl className={`grid grid-cols-2 gap-4 md:gap-6 ${isAdmin ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
            <StatCard label="Students" value={roleCount("student")} />
            <StatCard label="Teachers" value={roleCount("teacher")} />
            <StatCard label="Admins" value={roleCount("admin")} />
            {isAdmin ? (
              <StatCard
                label="Pending teacher requests"
                value={pending}
                note={pending > 0 ? "Review them on the Users page." : undefined}
                className={pending > 0 ? "border-warn/40 bg-warn-soft" : "border-line bg-surface"}
              />
            ) : null}
          </dl>
        </Rise>

        <Rise i={4}>
          <Card
            title={`Students who need help (${needHelp.length})`}
            className={needHelp.length > 0 ? "border-warn/40" : ""}
            action={
              needHelp.length > 0 ? (
                <Link href="/users?role=needs-help" className="link inline-flex items-center gap-1 text-sm">
                  All of them
                  <Icon name="arrow" size={16} />
                </Link>
              ) : null
            }
          >
            {needHelp.length === 0 ? (
              <EmptyState
                compact
                icon="check"
                title="No student is stuck right now"
                body="A student appears here after two or more wrong answers on an exercise they have not solved."
              />
            ) : (
              <ul className="divide-y divide-line">
                {needHelp.slice(0, 6).map((s) => (
                  <li key={s.id} className="flex flex-wrap items-start justify-between gap-2 py-3">
                    <div className="min-w-0">
                      <Link href={`/users/${s.id}`} className="link text-sm font-semibold">
                        {s.name}
                      </Link>
                      <p className="mt-0.5 text-xs text-muted">Stuck on {s.exercises.join("; ")}</p>
                    </div>
                    <Badge tone="warn" icon="alert">
                      {s.wrong} wrong {s.wrong === 1 ? "answer" : "answers"}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </Rise>

        <div className="grid gap-4 md:gap-6 lg:grid-cols-12">
          <Rise i={5} className="lg:col-span-7">
            <Card title="Tutor requests by outcome" className="h-full">
              {tutorTotal === 0 ? (
                <EmptyState
                  compact
                  title="No tutor requests yet"
                  body="They appear when a student asks the tutor a question and the tablet syncs."
                />
              ) : (
                <StackedBar
                  segments={segments}
                  summary={`Tutor requests by outcome: ${segments.map((s) => `${s.count} ${s.label.toLowerCase()}`).join(", ")}`}
                />
              )}
            </Card>
          </Rise>

          <Rise i={6} className="lg:col-span-5">
            <Card title={`Tablets (${devices.data.length})`} className="h-full">
              {devices.data.length === 0 ? (
                <EmptyState
                  compact
                  title="No tablet has synced yet"
                  body="Turn sync on in the tablet app under the topic list."
                />
              ) : (
                <ul className="divide-y divide-line">
                  {devices.data.map((d) => {
                    const status = syncStatus(d.last_sync_at);
                    return (
                      <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{d.label}</p>
                          <p className="text-xs text-muted">App version {d.app_version || "–"}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Badge tone={status.tone} icon={status.icon}>
                            {status.label}
                          </Badge>
                          <span className="text-xs text-muted">{timeAgo(d.last_sync_at)}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="mt-4 text-sm">
                <Link href="/devices" className="link inline-flex items-center gap-1">
                  All tablet details
                  <Icon name="arrow" size={16} />
                </Link>
              </p>
            </Card>
          </Rise>
        </div>
      </div>
    </>
  );
}
