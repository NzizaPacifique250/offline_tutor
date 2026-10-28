import Link from "next/link";
import { ConfirmButton } from "@/components/confirm-button";
import { LocalTime } from "@/components/local-time";
import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Table, Td } from "@/components/table";
import { requireStaff } from "@/lib/auth";
import { rows } from "@/lib/query";
import type { OverviewRow, Role } from "@/lib/types";
import { setRole } from "./actions";

const FILTERS = ["all", "student", "teacher", "admin"] as const;
const button = "rounded-md border px-3 py-1 text-sm font-medium";

type Props = { searchParams: Promise<{ role?: string; notice?: string; error?: string }> };

export default async function UsersPage({ searchParams }: Props) {
  const { role: roleParam, notice, error } = await searchParams;
  const { supabase, profile, user } = await requireStaff();
  const isAdmin = profile.role === "admin";
  const filter = FILTERS.find((f) => f === roleParam) ?? "all";

  const overview = await rows<OverviewRow>(
    supabase.from("learner_overview").select("*").order("created_at", { ascending: false }),
  );
  const pending = overview.data.filter((u) => u.role === "student" && u.requested_role === "teacher");
  const shown = filter === "all" ? overview.data : overview.data.filter((u) => u.role === filter);

  return (
    <>
      <PageHeader
        title="Users"
        description={isAdmin ? "Approve teacher requests and change roles." : "Accounts and their progress. Only an admin can change roles."}
        problem={overview.problem}
      />
      {notice ? <Notice tone="success">{notice}</Notice> : null}
      {error ? <Notice tone="problem">{error}</Notice> : null}

      {isAdmin && pending.length > 0 ? (
        <Section title="Pending teacher requests">
          <Table
            caption="Pending teacher requests"
            head={["Name", "Code", "Requested", "Action"]}
            empty=""
            isEmpty={false}
          >
            {pending.map((u) => (
              <tr key={u.user_id}>
                <Td>{u.full_name || "(no name)"}</Td>
                <Td>{u.learner_code}</Td>
                <Td>
                  <LocalTime iso={u.created_at} />
                </Td>
                <Td>
                  <div className="flex flex-wrap items-center gap-2">
                    <form action={setRole}>
                      <input type="hidden" name="target" value={u.user_id} />
                      <input type="hidden" name="role" value="teacher" />
                      <input type="hidden" name="name" value={u.full_name || u.learner_code} />
                      <ConfirmButton
                        message={`Make ${u.full_name || u.learner_code} a teacher? They will be able to see every learner's records.`}
                        className={`${button} border-brand-700 bg-brand-600 text-white hover:bg-brand-700`}
                      >
                        Approve as teacher
                      </ConfirmButton>
                    </form>
                    <form action={setRole}>
                      <input type="hidden" name="target" value={u.user_id} />
                      <input type="hidden" name="role" value="student" />
                      <input type="hidden" name="name" value={u.full_name || u.learner_code} />
                      <ConfirmButton
                        message={`Decline the teacher request of ${u.full_name || u.learner_code}? The account stays a student.`}
                        className={`${button} border-slate-300 bg-white text-slate-800 hover:bg-slate-50`}
                      >
                        Decline
                      </ConfirmButton>
                    </form>
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        </Section>
      ) : null}

      <Section title="All accounts">
        <nav aria-label="Filter by role" className="mb-3 flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Link
              key={f}
              href={f === "all" ? "/users" : `/users?role=${f}`}
              aria-current={f === filter ? "page" : undefined}
              className={`rounded-md border px-3 py-1 text-sm ${
                f === filter ? "border-brand-700 bg-brand-600 text-white" : "border-slate-300 bg-white text-slate-800 hover:bg-slate-100"
              }`}
            >
              {f === "all" ? "All" : f[0]?.toUpperCase() + f.slice(1) + "s"}
            </Link>
          ))}
        </nav>
        <Table
          caption="Accounts"
          head={["Name", "Code", "Role", "Attempts", "Exercises correct", "Tutor requests", "Last activity", ...(isAdmin ? ["Change role"] : [])]}
          empty="No accounts to show."
          isEmpty={shown.length === 0}
        >
          {shown.map((u) => (
            <tr key={u.user_id}>
              <Td>
                <Link href={`/users/${u.user_id}`} className="text-brand-700 underline">
                  {u.full_name || "(no name)"}
                </Link>
              </Td>
              <Td>{u.learner_code}</Td>
              <Td>
                {u.role}
                {u.role === "student" && u.requested_role === "teacher" ? " (teacher requested)" : ""}
              </Td>
              <Td numeric>{u.attempts}</Td>
              <Td numeric>{u.exercises_correct}</Td>
              <Td numeric>{u.tutor_requests}</Td>
              <Td>
                <LocalTime iso={u.last_activity} />
              </Td>
              {isAdmin ? (
                <Td>
                  {u.user_id === user.id ? (
                    <span className="text-slate-600">You</span>
                  ) : (
                    <RoleForm user={u} />
                  )}
                </Td>
              ) : null}
            </tr>
          ))}
        </Table>
      </Section>
    </>
  );
}

function RoleForm({ user }: { user: OverviewRow }) {
  const name = user.full_name || user.learner_code;
  const options: Role[] = ["student", "teacher", "admin"];
  return (
    <form action={setRole} className="flex items-center gap-2">
      <input type="hidden" name="target" value={user.user_id} />
      <input type="hidden" name="name" value={name} />
      <label htmlFor={`role-${user.user_id}`} className="sr-only">
        New role for {name}
      </label>
      <select id={`role-${user.user_id}`} name="role" defaultValue={user.role} className="rounded-md border border-slate-400 bg-white px-2 py-1 text-sm">
        {options.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      <ConfirmButton
        message={`Change the role of ${name}? Check the role you picked first.`}
        className={`${button} border-slate-400 bg-white text-slate-800 hover:bg-slate-100`}
      >
        Change
      </ConfirmButton>
    </form>
  );
}
