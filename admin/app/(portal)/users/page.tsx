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
import { Table, Td } from "@/components/table";
import { getClient, requireStaff } from "@/lib/auth";
import { rows } from "@/lib/query";
import { kigaliDateTime, timeAgo } from "@/lib/stats";
import type { OverviewRow, Role } from "@/lib/types";
import { capitalise, initials, roleTone } from "@/lib/ui";
import { setRole } from "./actions";

const FILTERS = ["all", "student", "teacher", "admin"] as const;
type Filter = (typeof FILTERS)[number];
const ROLES: Role[] = ["student", "teacher", "admin"];

type Props = {
  searchParams: Promise<{ role?: string; notice?: string; error?: string; id?: string; to?: string }>;
};

// The role-change action redirects here with short codes; the copy lives in this file.
const ERRORS: Record<string, string> = {
  invalid: "That request was not valid.",
  self: "You cannot change your own role.",
  failed: "The role was not changed. Try again, or check that you are still an admin.",
};

const EMPTY_BODY: Record<Filter, string> = {
  all: "Students appear here after they create an account in the tablet app and it syncs.",
  student: "Students appear here after they create an account in the tablet app and it syncs.",
  teacher: "Approve a teacher request to add one.",
  admin: "",
};

export default async function UsersPage({ searchParams }: Props) {
  const { role: roleParam, notice: noticeCode, error: errorCode, id: changedId, to } = await searchParams;
  const supabase = await getClient();
  // The query starts together with the staff check, not after it.
  const [{ profile, user }, overview] = await Promise.all([
    requireStaff(),
    rows<OverviewRow>(supabase.from("learner_overview").select("*").order("created_at", { ascending: false })),
  ]);
  const isAdmin = profile.role === "admin";
  const filter = FILTERS.find((f) => f === roleParam) ?? "all";
  // The account is looked up by its id, so the message never repeats text from the address bar.
  const changed = overview.data.find((u) => u.user_id === changedId);
  const notice =
    noticeCode === "role-changed" && ROLES.some((r) => r === to)
      ? `${changed ? changed.full_name || changed.learner_code : "The account"} is now ${to}.`
      : null;
  const error = errorCode ? (ERRORS[errorCode] ?? "That did not work. Try again.") : null;

  const pending = overview.data.filter((u) => u.role === "student" && u.requested_role === "teacher");
  const shown = filter === "all" ? overview.data : overview.data.filter((u) => u.role === filter);
  // Students includes people who have asked to become teachers, as on the Overview.
  const countFor = (f: Filter) => (f === "all" ? overview.data.length : overview.data.filter((u) => u.role === f).length);
  const filterLabel = (f: Filter) => (f === "all" ? "All" : capitalise(f) + "s");

  return (
    <>
      <PageHeader
        title="Users"
        description={isAdmin ? "Approve teacher requests and change roles." : "Accounts and their progress. Only an admin can change roles."}
        problem={overview.problem}
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

      <Rise i={1}>
        <h2 className="sr-only">All accounts</h2>
        <nav aria-label="Filter by role" className="mb-4 max-w-full overflow-x-auto">
          <div className="inline-flex gap-1 rounded-md bg-tint p-1">
            {FILTERS.map((f) => (
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
        <Table
          caption="Accounts"
          head={[
            "Learner",
            "Role",
            { label: "Attempts", numeric: true },
            { label: "Exercises correct", numeric: true },
            { label: "Tutor requests", numeric: true },
            "Last activity",
            ...(isAdmin ? ["Change role"] : []),
          ]}
          empty={
            filter === "all"
              ? { title: "No accounts to show", body: EMPTY_BODY.all }
              : {
                  title: `No ${filter}s yet`,
                  body: EMPTY_BODY[filter],
                  link: { href: "/users", label: "Show all accounts" },
                }
          }
          isEmpty={shown.length === 0}
        >
          {shown.map((u) => (
            <tr key={u.user_id} className="h-14">
              <Td rowHeader>
                <div className="flex items-center gap-3">
                  <span className="hidden sm:contents">
                    <Avatar initials={initials(u.full_name, u.learner_code)} />
                  </span>
                  <div>
                    <Link href={`/users/${u.user_id}`} className="link block max-w-56 truncate" title={u.full_name || undefined}>
                      {u.full_name || "(no name)"}
                    </Link>
                    <p className="text-xs text-muted">{u.learner_code}</p>
                  </div>
                </div>
              </Td>
              <Td>
                <span className="whitespace-nowrap">
                  <Badge tone={roleTone(u.role)}>{capitalise(u.role)}</Badge>
                </span>
              </Td>
              <Td numeric>{u.attempts}</Td>
              <Td numeric>
                <MiniProgress done={u.exercises_correct} />
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
              {isAdmin ? (
                <Td>{u.user_id === user.id ? <Badge tone="neutral">You</Badge> : <RoleForm user={u} />}</Td>
              ) : null}
            </tr>
          ))}
        </Table>
      </Rise>
    </>
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
