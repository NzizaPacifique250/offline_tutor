import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { Badge } from "@/components/badge";
import { Pips } from "@/components/bars";
import { Card } from "@/components/card";
import { ConfirmButton } from "@/components/confirm-button";
import { Icon } from "@/components/icons";
import { LocalTime } from "@/components/local-time";
import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { Rise } from "@/components/rise";
import { Ring } from "@/components/ring";
import { Section } from "@/components/section";
import { StatCard } from "@/components/stat";
import { SubmitButton } from "@/components/submit-button";
import { Table, Td } from "@/components/table";
import { getClient, requireStaff } from "@/lib/auth";
import { LESSONS, exerciseLabel, lessonTitle } from "@/lib/curriculum";
import { allRows, firstProblem, rows } from "@/lib/query";
import { TOTAL_EXERCISES, formatMs } from "@/lib/stats";
import type { Attempt, ClassMember, ClassRow, ExerciseProgress, GuidanceEvent, OverviewRow, Role } from "@/lib/types";
import { capitalise, initials, outcomeMeta, roleTone, verdictMeta } from "@/lib/ui";
import { deleteAccount, renameAccount, setAccountPassword, setRole } from "../actions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RECENT = 20;
const ROLES: Role[] = ["student", "teacher", "admin"];

// The account actions redirect here with short codes; the copy lives here.
const NOTICES: Record<string, string> = {
  renamed: "The name was changed.",
  "password-set": "The new password works from now on. Give it to the account's owner.",
};
const ERRORS: Record<string, string> = {
  invalid: "That request was not valid.",
  "invalid-name": "Enter a name of up to 120 characters.",
  "rename-failed": "The name was not changed. Try again, or check that migration 0004 has been run.",
  "short-password": "The password needs at least 8 characters.",
  "password-failed": "The password was not changed. Try again, or check that migration 0004 has been run.",
  "self-delete": "You cannot delete your own account.",
  "delete-admin": "Change this admin to another role before deleting the account.",
  "delete-failed": "The account was not deleted. Try again, or check that migration 0004 has been run.",
};

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string; error?: string }> };

export default async function UserPage({ params, searchParams }: Props) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { notice: noticeCode, error: errorCode } = await searchParams;
  const supabase = await getClient();

  // The queries start together with the staff check, not after it.
  const [{ profile: me, user: meUser }, [overview, attempts, tutor, exercises, memberships, classes]] = await Promise.all([
    requireStaff(),
    Promise.all([
      rows<OverviewRow>(supabase.from("learner_overview").select("*").eq("user_id", id)),
      allRows<Attempt>((from, to) =>
        supabase.from("attempts").select("*").eq("user_id", id).order("created_at", { ascending: false }).range(from, to),
      ),
      rows<GuidanceEvent>(
        supabase.from("guidance_events").select("*").eq("user_id", id).order("created_at", { ascending: false }).limit(RECENT),
      ),
      rows<ExerciseProgress>(supabase.from("exercise_progress").select("*").eq("user_id", id)),
      rows<ClassMember>(supabase.from("class_members").select("class_id, student_id").eq("student_id", id)),
      rows<ClassRow>(supabase.from("classes").select("id, name")),
    ]),
  ]);

  const problem = firstProblem(overview, attempts, tutor, exercises, memberships, classes);
  const user = overview.data[0];
  if (!user && !problem) notFound();
  if (!user) return <PageHeader title="Account" problem={problem} />;

  const correctIds = new Set(attempts.data.filter((a) => a.verdict === "correct").map((a) => a.exercise_id));
  const name = user.full_name || "(no name)";
  const shownName = user.full_name || user.learner_code;
  const isAdmin = me.role === "admin";
  const classNames = memberships.data.map((m) => classes.data.find((c) => c.id === m.class_id)?.name).filter(Boolean).join(", ");
  const notice = noticeCode ? (NOTICES[noticeCode] ?? null) : null;
  const error = errorCode ? (ERRORS[errorCode] ?? "That did not work. Try again.") : null;
  // Stuck first, then the most wrong answers, then the most recent.
  const struggles = exercises.data
    .filter((e) => e.wrong > 0 || !e.solved)
    .sort((a, b) => Number(b.stuck) - Number(a.stuck) || b.wrong - a.wrong || b.last_attempt_at.localeCompare(a.last_attempt_at));
  const stuckCount = exercises.data.filter((e) => e.stuck).length;

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
        description={[
          `Code ${user.learner_code}`,
          user.email,
          user.role === "student" ? (classNames ? `Class: ${classNames}` : "In no class") : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        problem={problem}
        kigaliTime
      />
      {notice || error ? (
        <div className="mb-6 space-y-4">
          {notice ? <Notice tone="success">{notice}</Notice> : null}
          {error ? <Notice tone="problem">{error}</Notice> : null}
        </div>
      ) : null}

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
          <dl className="grid h-full grid-cols-2 gap-4 sm:grid-cols-3">
            <StatCard label="Attempts" value={user.attempts} />
            <StatCard
              label="Wrong answers"
              value={user.wrong_answers ?? 0}
              note={stuckCount > 0 ? `Stuck on ${stuckCount} ${stuckCount === 1 ? "exercise" : "exercises"}` : undefined}
              className={stuckCount > 0 ? "border-warn/40 bg-warn-soft" : "border-line bg-surface"}
            />
            <StatCard label="Hints shown" value={user.hints} />
            <StatCard label="Solutions shown" value={user.solutions} />
            <StatCard label="Tutor requests" value={user.tutor_requests} />
            <StatCard label="Tutor failed or timed out" value={user.tutor_failed ?? 0} />
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

      <Section title={`Where ${shownName} struggles`}>
        <Table
          caption={`Exercises ${shownName} has answered wrongly or not yet solved`}
          head={[
            "Exercise",
            "Status",
            { label: "Wrong answers", numeric: true },
            { label: "Hints seen", numeric: true },
            "Solution opened",
            "Last wrong answer",
            "Last attempt",
          ]}
          empty={{ title: "No wrong answers yet", body: `${shownName} has solved every exercise they tried, or has not tried one yet.`, icon: "check" }}
          isEmpty={struggles.length === 0}
        >
          {struggles.map((e) => (
            <tr key={e.exercise_id}>
              <Td rowHeader>
                {exerciseLabel(e.exercise_id)}
                <span className="block text-xs text-muted">{lessonTitle(e.lesson_id)}</span>
              </Td>
              <Td>
                <span className="whitespace-nowrap">
                  {e.stuck ? (
                    <Badge tone="warn" icon="alert">
                      Stuck
                    </Badge>
                  ) : e.solved ? (
                    <Badge tone="ok" icon="check">
                      Solved after {e.wrong} wrong
                    </Badge>
                  ) : (
                    <Badge tone="info" icon="clock">
                      Still trying
                    </Badge>
                  )}
                </span>
              </Td>
              <Td numeric>{e.wrong}</Td>
              <Td numeric>{e.hints_seen}</Td>
              <Td>{e.solution_seen ? "Yes" : <span className="text-muted">No</span>}</Td>
              <Td>
                {e.last_wrong_answer ? (
                  <span className="block max-w-48 truncate font-mono text-[13px]" title={e.last_wrong_answer}>
                    {e.last_wrong_answer}
                  </span>
                ) : (
                  <span className="text-muted">–</span>
                )}
              </Td>
              <Td>
                <LocalTime iso={e.last_attempt_at} />
              </Td>
            </tr>
          ))}
        </Table>
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

      {isAdmin ? <ManageAccount user={user} isSelf={user.user_id === meUser.id} /> : null}
    </>
  );
}

// Admins only. Each form posts to a server action that checks the role again,
// and the database checks it a third time.
function ManageAccount({ user, isSelf }: { user: OverviewRow; isSelf: boolean }) {
  const name = user.full_name || user.learner_code;
  return (
    <Section title="Manage account">
      <div className="grid gap-4 md:grid-cols-2 md:gap-6">
        <Card title="Name">
          <form action={renameAccount} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <input type="hidden" name="target" value={user.user_id} />
            <div className="grow">
              <label htmlFor="rename" className="text-sm font-medium">
                Full name
              </label>
              <input id="rename" name="full_name" required maxLength={120} defaultValue={user.full_name} className="field mt-1" />
            </div>
            <SubmitButton pendingLabel="Saving…" className="btn btn-secondary">
              Save name
            </SubmitButton>
          </form>
        </Card>

        <Card title="New password">
          <form action={setAccountPassword} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <input type="hidden" name="target" value={user.user_id} />
            <div className="grow">
              <label htmlFor="new-password" className="text-sm font-medium">
                Password for {name}
              </label>
              <input
                id="new-password"
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                className="field mt-1"
              />
            </div>
            <SubmitButton pendingLabel="Setting…" className="btn btn-secondary">
              Set password
            </SubmitButton>
          </form>
          <p className="mt-2 text-xs text-muted">At least 8 characters. The old password stops working.</p>
        </Card>

        {isSelf ? null : (
          <Card title="Role">
            <form action={setRole} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <input type="hidden" name="target" value={user.user_id} />
              <div className="grow">
                <label htmlFor="role" className="text-sm font-medium">
                  Role
                </label>
                <select id="role" name="role" defaultValue={user.role} className="field mt-1">
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {capitalise(r)}
                    </option>
                  ))}
                </select>
              </div>
              <SubmitButton pendingLabel="Changing…" className="btn btn-secondary">
                Change role
              </SubmitButton>
            </form>
          </Card>
        )}

        {isSelf ? null : (
          <Card title="Delete account" className="border-bad/30">
            {user.role === "admin" ? (
              <p className="text-sm text-muted">Change this admin to another role before deleting the account.</p>
            ) : (
              <form action={deleteAccount}>
                <input type="hidden" name="target" value={user.user_id} />
                <p className="mb-3 text-sm text-ink-2">
                  Deletes the account and everything it synced: sessions, answers, hints and tutor requests. The records
                  stay on the tablet.
                </p>
                <ConfirmButton
                  message={`Delete ${name}'s account and everything it synced? This cannot be undone.`}
                  className="btn btn-secondary text-bad hover:bg-bad-soft active:bg-bad-soft"
                >
                  <Icon name="trash" size={16} />
                  Delete account
                </ConfirmButton>
              </form>
            )}
          </Card>
        )}
      </div>
    </Section>
  );
}
