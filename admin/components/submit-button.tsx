"use client";

import { useFormStatus } from "react-dom";

type Props = { pendingLabel: string; className?: string; children: string };

// Label swaps inside a grid so the button keeps the width of the longer text.
export function SubmitButton({ pendingLabel, className = "btn btn-primary", children }: Props) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-disabled={pending} className={className}>
      {pending ? <Spinner /> : null}
      <span className="grid">
        <span className={`col-start-1 row-start-1 ${pending ? "invisible" : ""}`} aria-hidden={pending}>
          {children}
        </span>
        <span className={`col-start-1 row-start-1 ${pending ? "" : "invisible"}`} aria-hidden={!pending}>
          {pendingLabel}
        </span>
      </span>
    </button>
  );
}

export function Spinner() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="animate-spin">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
