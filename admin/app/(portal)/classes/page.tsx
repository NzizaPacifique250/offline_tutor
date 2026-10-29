import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { Badge } from "@/components/badge";
import { Card } from "@/components/card";
import { ConfirmButton } from "@/components/confirm-button";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icons";
import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { Rise } from "@/components/rise";
import { SubmitButton } from "@/components/submit-button";
import { getClient, requireStaff } from "@/lib/auth";
import { firstProblem, rows } from "@/lib/query";
import type { ClassMember, ClassRow, OverviewRow } from "@/lib/types";
import { initials } from "@/lib/ui";
import { addStudent, createClass, deleteClass, removeStudent, updateClass } from "./actions";

type Person = Pick<OverviewRow, "user_id" | "full_name" | "learner_code" | "role" | "email" | "exercises_stuck">;

// The actions redirect here with short codes; the copy lives here.
const NOTICES: Record<string, string> = {
  created: "The class was created. Add its students below.",
  updated: "The class was saved.",
  deleted: "The class was deleted. Its students keep their accounts and records.",
  added: "The student was added to the class.",
  removed: "The student was removed from the class.",
};
const ERRORS: Record<string, string> = {
  invalid: "That request was not valid.",
  "invalid-name": "Enter a class name of up to 80 characters.",
  "create-failed": "The class was not created. Check that migration 0005 has been run.",
  "update-failed": "The class was not saved. Its teacher must be a teacher or an admin.",
  "delete-failed": "The class was not deleted. Try again.",
  "already-member": "That student is already in the class.",
  "add-failed": "The student was not added. Only students can join a class.",
  "remove-failed": "The student was not removed. Try again.",
};

const nameOf = (p: Person | undefined) => (p ? p.full_name || p.learner_code : "Unknown account");
const byName = (a: Person, b: Person) => nameOf(a).localeCompare(nameOf(b));

type Props = { searchParams: Promise<{ notice?: string; error?: string }> };

export default async function ClassesPage({ searchParams }: Props) {
  const { notice: noticeCode, error: errorCode } = await searchParams;
  const supabase = await getClient();
  // What each person can read is decided by the database: an admin every
  // class and account, a teacher their own classes and students.
  const [{ profile }, [classes, members, people]] = await Promise.all([
    requireStaff(),
    Promise.all([
      rows<ClassRow>(supabase.from("classes").select("*").order("name")),
      rows<ClassMember>(supabase.from("class_members").select("*")),
      rows<Person>(supabase.from("learner_overview").select("user_id, full_name, learner_code, role, email, exercises_stuck")),
    ]),
  ]);
  const isAdmin = profile.role === "admin";
  const problem = firstProblem(classes, members, people);
  const notice = noticeCode ? (NOTICES[noticeCode] ?? null) : null;
  const error = errorCode ? (ERRORS[errorCode] ?? "That did not work. Try again.") : null;

  const person = new Map(people.data.map((p) => [p.user_id, p]));
  const students = people.data.filter((p) => p.role === "student").sort(byName);
  const teachers = people.data.filter((p) => p.role === "teacher" || p.role === "admin").sort(byName);
  const inAClass = new Set(members.data.map((m) => m.student_id));
  const unassigned = students.filter((s) => !inAClass.has(s.user_id));

  return (
    <>
      <PageHeader
        title="Classes"
        description={
          isAdmin
            ? "Create classes, choose each class's teacher and add its students. A teacher sees only the students in their own classes."
            : "Your classes and their students. An admin creates classes and adds students."
        }
        problem={problem}
      />
      {notice || error ? (
        <div className="mb-6 space-y-4">
          {notice ? <Notice tone="success">{notice}</Notice> : null}
          {error ? <Notice tone="problem">{error}</Notice> : null}
        </div>
      ) : null}

      {isAdmin ? (
        <Rise>
          <Card title="Create a class" className="mb-8">
            <form action={createClass} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <div>
                <label htmlFor="class-name" className="text-sm font-medium">
                  Class name
                </label>
                <input id="class-name" name="name" required maxLength={80} placeholder="S6 MCE, morning group" className="field mt-1" />
              </div>
              <TeacherSelect id="class-teacher" teachers={teachers} />
              <SubmitButton pendingLabel="Creating…">Create class</SubmitButton>
            </form>
          </Card>
        </Rise>
      ) : null}

      {classes.data.length === 0 && !problem ? (
        <EmptyState
          icon="classes"
          title={isAdmin ? "No classes yet" : "You have no classes yet"}
          body={
            isAdmin
              ? "Create a class above, choose its teacher and add its students."
              : "An admin makes you the teacher of a class; its students then appear here and across the portal."
          }
        />
      ) : null}

      <div className="grid gap-4 md:gap-6 xl:grid-cols-2">
        {classes.data.map((c, i) => {
          const memberIds = members.data.filter((m) => m.class_id === c.id).map((m) => m.student_id);
          const roster = memberIds.map((id) => person.get(id)).filter((p): p is Person => Boolean(p)).sort(byName);
          const addable = students.filter((s) => !memberIds.includes(s.user_id));
          const teacherName = c.teacher_id ? nameOf(person.get(c.teacher_id)) : null;
          return (
            <Rise key={c.id} i={i + 1}>
              <section
                aria-labelledby={`class-${c.id}`}
                className="h-full rounded-lg border border-line bg-surface p-5 shadow-card"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 id={`class-${c.id}`} className="truncate text-lg font-semibold">
                      {c.name}
                    </h2>
                    <p className="text-sm text-muted">{teacherName ? `Teacher: ${teacherName}` : "No teacher yet"}</p>
                  </div>
                  <Badge tone="neutral">
                    {roster.length} {roster.length === 1 ? "student" : "students"}
                  </Badge>
                </div>

                {roster.length === 0 ? (
                  <p className="mt-4 text-sm text-muted">No students in this class yet.</p>
                ) : (
                  <ul className="mt-4 divide-y divide-line">
                    {roster.map((s) => (
                      <li key={s.user_id} className="flex items-center justify-between gap-3 py-2.5">
                        <div className="flex min-w-0 items-center gap-3">
                          <Avatar initials={initials(s.full_name, s.learner_code)} />
                          <div className="min-w-0">
                            <Link href={`/users/${s.user_id}`} className="link block truncate text-sm font-semibold">
                              {nameOf(s)}
                            </Link>
                            <p className="truncate text-xs text-muted">{s.email || s.learner_code}</p>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {(s.exercises_stuck ?? 0) > 0 ? (
                            <Badge tone="warn" icon="alert">
                              Stuck on {s.exercises_stuck}
                            </Badge>
                          ) : null}
                          {isAdmin ? (
                            <form action={removeStudent}>
                              <input type="hidden" name="class_id" value={c.id} />
                              <input type="hidden" name="student_id" value={s.user_id} />
                              <ConfirmButton
                                message={`Remove ${nameOf(s)} from ${c.name}? Their account and records stay.`}
                                className="btn btn-secondary btn-sm"
                              >
                                Remove
                              </ConfirmButton>
                            </form>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {isAdmin ? (
                  <div className="mt-4 space-y-4 border-t border-line pt-4">
                    {addable.length > 0 ? (
                      <form action={addStudent} className="flex flex-col gap-2 sm:flex-row sm:items-end">
                        <input type="hidden" name="class_id" value={c.id} />
                        <div className="grow">
                          <label htmlFor={`add-${c.id}`} className="text-sm font-medium">
                            Add a student
                          </label>
                          <select id={`add-${c.id}`} name="student_id" required defaultValue="" className="field mt-1">
                            <option value="" disabled>
                              Choose a student
                            </option>
                            {addable.map((s) => (
                              <option key={s.user_id} value={s.user_id}>
                                {nameOf(s)} ({s.learner_code}){inAClass.has(s.user_id) ? "" : ", in no class"}
                              </option>
                            ))}
                          </select>
                        </div>
                        <SubmitButton pendingLabel="Adding…" className="btn btn-secondary">
                          Add
                        </SubmitButton>
                      </form>
                    ) : (
                      <p className="text-sm text-muted">Every student is in this class.</p>
                    )}

                    <details>
                      <summary className="link inline-flex cursor-pointer list-none items-center gap-1 text-sm [&::-webkit-details-marker]:hidden">
                        <Icon name="pencil" size={16} />
                        Rename, change the teacher or delete
                      </summary>
                      <form action={updateClass} className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                        <input type="hidden" name="class_id" value={c.id} />
                        <div>
                          <label htmlFor={`name-${c.id}`} className="text-sm font-medium">
                            Class name
                          </label>
                          <input id={`name-${c.id}`} name="name" required maxLength={80} defaultValue={c.name} className="field mt-1" />
                        </div>
                        <TeacherSelect id={`teacher-${c.id}`} teachers={teachers} current={c.teacher_id} />
                        <SubmitButton pendingLabel="Saving…" className="btn btn-secondary">
                          Save
                        </SubmitButton>
                      </form>
                      <form action={deleteClass} className="mt-3">
                        <input type="hidden" name="class_id" value={c.id} />
                        <ConfirmButton
                          message={`Delete the class ${c.name}? Its students keep their accounts and records, but its teacher no longer sees them.`}
                          className="btn btn-secondary text-bad hover:bg-bad-soft active:bg-bad-soft"
                        >
                          <Icon name="trash" size={16} />
                          Delete class
                        </ConfirmButton>
                      </form>
                    </details>
                  </div>
                ) : null}
              </section>
            </Rise>
          );
        })}
      </div>

      {isAdmin && unassigned.length > 0 ? (
        <Rise i={classes.data.length + 1}>
          <Card title={`Students in no class (${unassigned.length})`} className="mt-8">
            <p className="mb-3 text-sm text-muted">No teacher sees these students until they join a class.</p>
            <ul className="flex flex-wrap gap-2">
              {unassigned.map((s) => (
                <li key={s.user_id}>
                  <Link href={`/users/${s.user_id}`} className="inline-flex h-8 items-center rounded-md bg-tint px-3 text-sm hover:bg-tint-strong">
                    {nameOf(s)}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </Rise>
      ) : null}
    </>
  );
}

function TeacherSelect({ id, teachers, current }: { id: string; teachers: Person[]; current?: string | null }) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium">
        Teacher
      </label>
      <select id={id} name="teacher_id" defaultValue={current ?? ""} className="field mt-1">
        <option value="">No teacher yet</option>
        {teachers.map((t) => (
          <option key={t.user_id} value={t.user_id}>
            {nameOf(t)}
            {t.role === "admin" ? " (admin)" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
