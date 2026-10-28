"use client";

import { useFormStatus } from "react-dom";
import { Spinner } from "@/components/submit-button";

type Props = { message: string; className?: string; children: React.ReactNode };

// Submit button that asks the admin to confirm before the form is sent.
export function ConfirmButton({ message, className, children }: Props) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      aria-disabled={pending}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {pending ? <Spinner /> : null}
      {children}
    </button>
  );
}
