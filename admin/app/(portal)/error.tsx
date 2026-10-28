"use client";

import { EmptyState } from "@/components/empty-state";
import { useIsAdmin } from "@/components/role-context";

export default function PortalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const isAdmin = useIsAdmin();
  return (
    <EmptyState
      icon="alert"
      title="This page could not load"
      body={
        isAdmin
          ? "Try again. If it keeps failing, check the connection to Supabase."
          : "Try again. If it keeps failing, tell an admin."
      }
    >
      <button type="button" onClick={reset} className="btn btn-primary">
        Try again
      </button>
    </EmptyState>
  );
}
