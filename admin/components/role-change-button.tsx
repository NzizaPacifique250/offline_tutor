"use client";

import { useFormStatus } from "react-dom";
import { Spinner } from "@/components/submit-button";

type Props = { name: string; currentRole: string; className?: string; children: React.ReactNode };

const WITH_ARTICLE: Record<string, string> = { student: "a student", teacher: "a teacher", admin: "an admin" };

// Reads the role picked in the form at click time, so the question names the new role.
export function RoleChangeButton({ name, currentRole, className, children }: Props) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      aria-disabled={pending}
      onClick={(event) => {
        const picked = event.currentTarget.form?.elements.namedItem("role");
        const role = picked instanceof HTMLSelectElement ? picked.value : "";
        if (role === currentRole) {
          window.alert(`${name} is already ${WITH_ARTICLE[role] ?? role}. Pick a different role first.`);
          event.preventDefault();
          return;
        }
        const message =
          role === "admin"
            ? `Make ${name} an admin? Admins can change everyone's role.`
            : role === "teacher"
              ? `Make ${name} a teacher? They will be able to see every learner's records.`
              : `Change ${name} from ${currentRole} to ${role}?`;
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {pending ? <Spinner /> : null}
      {children}
    </button>
  );
}
