import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { Badge } from "@/components/badge";
import { MiniProgress } from "@/components/bars";
import { ConfirmButton } from "@/components/confirm-button";
import { Icon } from "@/components/icons";
import { LocalTime } from "@/components/local-time";
import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { RoleChangeButton } from "@/components/role-change-button";
import { Rise } from "@/components/rise";
import { SubmitButton } from "@/components/submit-button";
import { Table, Td } from "@/components/table";
import { getClient, requireStaff } from "@/lib/auth";
import { firstProblem, rows } from "@/lib/query";
import { isStruggling, struggles, type ProgressRow, type StudentStruggles } from "@/lib/struggles";
import { kigaliDateTime, timeAgo } from "@/lib/stats";
import type { ClassMember, ClassRow, OverviewRow, Role } from "@/lib/types";
import { capitalise, initials, roleTone } from "@/lib/ui";
import { createAccount, setRole } from "./actions";

const FILTERS = ["all", "student", "teacher", "admin", "struggling"] as const;
type Filter = (typeof FILTERS)[number];
const ROLES: Role[] = ["student", "teacher", "admin"];

type Props = {
  searchParams: Promise<{ role?: string; notice?: string; error?: string; id?: string; to?: string }>;
};

// The actions redirect here with short codes; the copy lives in this file.
const ERRORS: Record<string, string> = {
  invalid: "That request was not valid.",
  self: "You cannot change your own role.",
  failed: "The role was not changed. Try again, or check that you are still an admin.",
  "invalid-account": "Enter a name, a valid email address and a role.",
  "short-password": "The password needs at least 8 characters.",
  "email-taken": "An account with that email already exists.",
  unreachable: "The account was not created: the server could not be reached. Try again in a minute.",
  "create-failed": "The account was not created. Try again, or check the email address.",
  "created-not-promoted": "The account was created as a student, but its role was not changed. Change it in the table below.",
};

const EMPTY_BODY: Record<Filter, string> = {
  all: "Students appear here after they create an account in the tablet app and it syncs.",
  student: "Students appear here after they create an account in the tablet app and it syncs.",
  teacher: "Approve a teacher request to add one.",
  admin: "",
  struggling: "No student has two or more wrong answers on any exercise yet.",
};

export default async function UsersPage({ searchParams }: Props) {
  const { role: roleParam, notice: noticeCode, error: errorCode, id: changedId, to } = await searchParams;
  const supabase = await getClient();
  // The query starts together with the staff check, not after it.
  // An admin reads every account; a teacher the students in their classes.
  const [{ profile, user }, overview, classes, members, wrongRows] = await Promise.all([
    requireStaff(),
    rows<OverviewRow>(supabase.from("learner_overview").select("*").order("created_at", { ascending: false })),
    rows<ClassRow>(supabase.from("classes").select("id, name, teacher_id")),
    rows<ClassMember>(supabase.from("class_members").select("class_id, student_id")),
    rows<ProgressRow>(
      supabase.from("exercise_progress").select("user_id, exercise_id, wrong, solved, stuck, last_attempt_at").gte("wrong", 1),
    ),
  ]);
  const struggleOf = struggles(wrongRows.data);
  const isAdmin = profile.role === "admin";
  const filters: readonly Filter[] = isAdmin ? FILTERS : ["all", "struggling"];
  // "needs-help" was this filter's earlier name; old links still work.
  const filter = filters.find((f) => f === (roleParam === "needs-help" ? "struggling" : roleParam)) ?? "all";
  const accounts = isAdmin ? overview.data : overview.data.filter((u) => u.role === "student");
  const className = new Map(classes.data.map((c) => [c.id, c.name]));
  const classesOf = (id: string) =>
    members.data.filter((m) => m.student_id === id).map((m) => className.get(m.class_id)).filter(Boolean).join(", ");
  // What a teacher or an admin teaches: their classes and those classes' students.
  const taughtBy = (id: string) => {
    const own = classes.data.filter((c) => c.teacher_id === id);
    const ids = new Set(members.data.filter((m) => own.some((c) => c.id === m.class_id)).map((m) => m.student_id));
    return { classes: own.map((c) => c.name), students: ids.size, struggling: [...ids].filter((sid) => isStruggling(struggleOf.get(sid))).length };
  };
  // The account is looked up by its id, so the message never repeats text from the address bar.
  const changed = accounts.find((u) => u.user_id === changedId);
  const changedName = changed ? changed.full_name || changed.learner_code : "The account";
  const notice =
    noticeCode === "role-changed" && ROLES.some((r) => r === to)
      ? `${changedName} is now ${to}.`
      : noticeCode === "account-created"
        ? `${changed ? `${changedName} (${changed.email || changed.learner_code})` : "The new account"} can now sign in, in the tablet app or here.`
        : noticeCode === "account-deleted"
          ? "The account and everything it synced were deleted."
          : null;
  const error = errorCode ? (ERRORS[errorCode] ?? "That did not work. Try again.") : null;

  const pending = accounts.filter((u) => u.role === "student" && u.requested_role === "teacher");
  const matches = (f: Filter) => (u: OverviewRow) =>
    f === "all" ? true : f === "struggling" ? u.role === "student" && isStruggling(struggleOf.get(u.user_id)) : u.role === f;
  const shown = accounts.filter(matches(filter));
  // Students includes people who have asked to become teachers, as on the Overview.
  const countFor = (f: Filter) => accounts.filter(matches(f)).length;
  const filterLabel = (f: Filter) =>
    f === "all" ? (isAdmin ? "All" : "Your students") : f === "struggling" ? "Struggling" : capitalise(f) + "s";

  return (
    <>
      <PageHeader
        title="Users"
        description={
          isAdmin
            ? "Create accounts, approve teacher requests and change roles. Open an account to rename it, set a new password or delete it."
            : "The students in your classes and their progress. Only an admin creates or changes accounts."
        }
        problem={firstProblem(overview, classes, members, wrongRows)}
        kigaliTime
      />
      {notice || error ? (
        <div className="mb-6 space-y-4">
          {notice ? <Notice tone="success">{notice}</Notice> : null}
          {error ? <Notice tone="problem">{error}</Notice> : null}
        </div>
      ) : null}

      {isAdmin ? (
        <Rise>
          {pending.length > 0 ? (
            <section aria-labelledby="requests-heading" className="mb-8">
              <h2 id="requests-heading" className="mb-4 flex items-center gap-2 text-lg font-semibold">
                Teacher requests
                <Badge tone="warn">{pending.length}</Badge>
              </h2>
              <ul className="space-y-3">
                {pending.map((u) => {
                  const name = u.full_name || u.learner_code;
                  return (
                    <li
                      key={u.user_id}
                      className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-l-4 border-line border-l-warn bg-surface p-4 shadow-card"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar initials={initials(u.full_name, u.learner_code)} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{u.full_name || "(no name)"}</p>
                          <p className="text-xs text-muted">
                            Code {u.learner_code}, asked <LocalTime iso={u.created_at} />
                          </p>
                        </div>
                      </div>
                      <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
                        <form action={setRole}>
                          <input type="hidden" name="target" value={u.user_id} />
                          <input type="hidden" name="role" value="teacher" />
                          <ConfirmButton
                            message={`Make ${name} a teacher? They will be able to see every learner's records.`}
                            className="btn btn-primary w-full"
                          >
                            <Icon name="check" size={16} />
                            Approve as teacher
                          </ConfirmButton>
                        </form>
                        <form action={setRole}>
                          <input type="hidden" name="target" value={u.user_id} />
                          <input type="hidden" name="role" value="student" />
                          <ConfirmButton
                            message={`Decline the teacher request of ${name}? The account stays a student.`}
                            className="btn btn-secondary w-full text-bad hover:bg-bad-soft active:bg-bad-soft"
                          >
                            Decline
                          </ConfirmButton>
                        </form>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : (
            <p className="mb-6 flex items-center gap-2 text-sm text-muted">
              <Icon name="check" size={16} />
              No teacher requests are waiting.
            </p>
          )}
        </Rise>
      ) : null}

      {isAdmin ? (
        <Rise i={1}>
          <CreateAccount />
        </Rise>
      ) : null}

      <Rise i={2}>
        <h2 className="sr-only">All accounts</h2>
        <nav aria-label="Filter by role" className="mb-4 max-w-full overflow-x-auto">
          <div className="inline-flex gap-1 rounded-md bg-tint p-1">
            {filters.map((f) => (
              <Link
                key={f}
                href={f === "all" ? "/users" : `/users?role=${f}`}
                aria-current={f === filter ? "page" : undefined}
                className={`inline-flex h-8 items-center gap-2 rounded-sm px-3 text-sm whitespace-nowrap transition-colors duration-150 ${
                  f === filter
                    ? "bg-surface font-semibold text-primary shadow-card"
                    : "font-medium text-ink-2 hover:bg-tint-strong"
                }`}
              >
                {filterLabel(f)}
                <span className="text-muted tabular-nums">{countFor(f)}</span>
              </Link>
            ))}
          </div>
        </nav>
        {(() => {
          // Students and staff have different things to show: a student's
          // learning, a teacher's or admin's classes. "All" shows both tables.
          const students = shown.filter((u) => u.role === "student");
          const staff = shown.filter((u) => u.role !== "student");
          const showStudents = filter !== "teacher" && filter !== "admin";
          const showStaff = isAdmin && (filter === "all" || filter === "teacher" || filter === "admin");
          return (
            <div className="space-y-8">
              {showStudents ? (
                <section aria-labelledby="students-heading">
                  {showStaff ? (
                    <h2 id="students-heading" className="mb-3 text-lg font-semibold">
                      Students <span className="text-muted tabular-nums">({students.length})</span>
                    </h2>
                  ) : (
                    <h2 id="students-heading" className="sr-only">
                      Students
                    </h2>
                  )}
                  <Table
                    caption="Students"
                    head={[
                      "Student",
                      "Class",
                      { label: "Attempts", numeric: true },
                      { label: "Exercises correct", numeric: true },
                      { label: "Wrong answers", numeric: true },
                      "Struggles",
                      { label: "Tutor requests", numeric: true },
                      "Last activity",
                      ...(isAdmin ? ["Change role"] : []),
                    ]}
                    empty={
                      filter === "struggling"
                        ? { title: "No one is struggling right now", body: EMPTY_BODY.struggling, link: { href: "/users", label: "Show all accounts" } }
                        : isAdmin
                          ? { title: "No students yet", body: EMPTY_BODY.student }
                          : { title: "No students in your classes yet", body: "An admin adds students to your classes on the Classes page." }
                    }
                    isEmpty={students.length === 0}
                  >
                    {students.map((u) => (
                      <tr key={u.user_id} className="h-14">
                        <Td rowHeader>
                          <AccountName u={u} />
                        </Td>
                        <Td>{classesOf(u.user_id) || <span className="text-muted">No class</span>}</Td>
                        <Td numeric>{u.attempts}</Td>
                        <Td numeric>
                          <MiniProgress done={u.exercises_correct} />
                        </Td>
                        <Td numeric>{u.wrong_answers ?? "–"}</Td>
                        <Td>
                          <StruggleBadges s={struggleOf.get(u.user_id)} />
                        </Td>
                        <Td numeric>{u.tutor_requests}</Td>
                        <Td>
                          {u.last_activity ? (
                            <span className="whitespace-nowrap" title={kigaliDateTime(u.last_activity)}>
                              {timeAgo(u.last_activity)}
                            </span>
                          ) : (
                            <span className="text-muted">No activity yet</span>
                          )}
                        </Td>
                        {isAdmin ? <Td>{u.user_id === user.id ? <Badge tone="neutral">You</Badge> : <RoleForm user={u} />}</Td> : null}
                      </tr>
                    ))}
                  </Table>
                </section>
              ) : null}

              {showStaff ? (
                <section aria-labelledby="staff-heading">
                  <h2 id="staff-heading" className="mb-3 text-lg font-semibold">
                    {filter === "teacher" ? "Teachers" : filter === "admin" ? "Admins" : "Teachers and admins"}{" "}
                    <span className="text-muted tabular-nums">({staff.length})</span>
                  </h2>
                  <Table
                    caption="Teachers and admins"
                    head={["Name", "Role", "Teaches", { label: "Students", numeric: true }, { label: "Struggling", numeric: true }, "Joined", "Change role"]}
                    empty={{ title: `No ${filter === "admin" ? "admins" : "teachers"} yet`, body: EMPTY_BODY.teacher, link: { href: "/users", label: "Show all accounts" } }}
                    isEmpty={staff.length === 0}
                  >
                    {staff.map((u) => {
                      const t = taughtBy(u.user_id);
                      return (
                        <tr key={u.user_id} className="h-14">
                          <Td rowHeader>
                            <AccountName u={u} />
                          </Td>
                          <Td>
                            <span className="whitespace-nowrap">
                              <Badge tone={roleTone(u.role)}>{capitalise(u.role)}</Badge>
                            </span>
                          </Td>
                          <Td>{t.classes.length ? t.classes.join(", ") : <span className="text-muted">No class</span>}</Td>
                          <Td numeric>{t.students}</Td>
                          <Td numeric>{t.struggling > 0 ? <span className="font-semibold text-warn">{t.struggling}</span> : t.struggling}</Td>
                          <Td>
                            <LocalTime iso={u.created_at} />
                          </Td>
                          <Td>{u.user_id === user.id ? <Badge tone="neutral">You</Badge> : <RoleForm user={u} />}</Td>
                        </tr>
                      );
                    })}
                  </Table>
                </section>
              ) : null}
            </div>
          );
        })()}
      </Rise>
    </>
  );
}

function AccountName({ u }: { u: OverviewRow }) {
  return (
    <div className="flex items-center gap-3">
      <span className="hidden sm:contents">
        <Avatar initials={initials(u.full_name, u.learner_code)} />
      </span>
      <div>
        <Link href={`/users/${u.user_id}`} className="link block max-w-56 truncate" title={u.full_name || undefined}>
          {u.full_name || "(no name)"}
        </Link>
        <p className="max-w-64 truncate text-xs text-muted" title={u.email || undefined}>
          {u.learner_code}
          {u.email ? ` · ${u.email}` : ""}
        </p>
      </div>
    </div>
  );
}

// Stuck: two or more wrong answers on an exercise not yet solved. Struggled:
// as many on an exercise solved later. Both count as struggling.
function StruggleBadges({ s }: { s: StudentStruggles | undefined }) {
  if (!isStruggling(s) || !s) return <span className="text-muted">–</span>;
  return (
    <span className="flex flex-wrap gap-1 whitespace-nowrap">
      {s.stuck > 0 ? (
        <Badge tone="warn" icon="alert">
          Stuck on {s.stuck}
        </Badge>
      ) : null}
      {s.struggled > 0 ? (
        <Badge tone="info" icon="clock">
          Struggled on {s.struggled}
        </Badge>
      ) : null}
    </span>
  );
}

// Behind a disclosure so the page leads with the accounts. A new account is
// created as a student by the database, then given the role picked here.
function CreateAccount() {
  return (
    <details className="group mb-8 rounded-lg border border-line bg-surface shadow-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2 text-base font-semibold">
          <Icon name="plus" size={18} />
          Create an account
        </span>
        <span className="text-sm text-muted group-open:hidden">For a student, a teacher or an admin</span>
      </summary>
      <form action={createAccount} className="grid gap-4 border-t border-line p-4 sm:grid-cols-2">
        <div>
          <label htmlFor="new-name" className="text-sm font-medium">
            Full name
          </label>
          <input id="new-name" name="full_name" required maxLength={120} autoComplete="off" className="field mt-1" />
        </div>
        <div>
          <label htmlFor="new-email" className="text-sm font-medium">
            Email
          </label>
          <input id="new-email" name="email" type="email" required autoComplete="off" className="field mt-1" />
        </div>
        <div>
          <label htmlFor="new-password" className="text-sm font-medium">
            Password
          </label>
          <input
            id="new-password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            aria-describedby="new-password-help"
            className="field mt-1"
          />
          <p id="new-password-help" className="mt-1 text-xs text-muted">
            At least 8 characters. Give it to the person; they sign in with it in the tablet app or here.
          </p>
        </div>
        <div>
          <label htmlFor="new-role" className="text-sm font-medium">
            Role
          </label>
          <select id="new-role" name="role" defaultValue="student" className="field mt-1">
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {capitalise(r)}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <SubmitButton pendingLabel="Creating…">Create account</SubmitButton>
        </div>
      </form>
    </details>
  );
}

// The select and button sit behind a "Change role" disclosure so the column stays narrow.
function RoleForm({ user }: { user: OverviewRow }) {
  const name = user.full_name || user.learner_code;
  return (
    <details>
      <summary className="link inline-flex h-8 cursor-pointer list-none items-center whitespace-nowrap [&::-webkit-details-marker]:hidden">
        Change role
      </summary>
      <form action={setRole} className="mt-2 flex flex-col items-start gap-2">
        <input type="hidden" name="target" value={user.user_id} />
        <label htmlFor={`role-${user.user_id}`} className="sr-only">
          New role for {name}
        </label>
        <select id={`role-${user.user_id}`} name="role" defaultValue={user.role} className="field field-sm w-auto">
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {capitalise(r)}
            </option>
          ))}
        </select>
        <RoleChangeButton name={name} currentRole={user.role} className="btn btn-secondary">
          Change
        </RoleChangeButton>
      </form>
    </details>
  );
}
