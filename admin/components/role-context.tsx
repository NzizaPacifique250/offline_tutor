"use client";

import { createContext, useContext } from "react";

const RoleContext = createContext<string | null>(null);

// Lets client components such as the error boundary know whether to show technical details.
export function RoleProvider({ role, children }: { role: string; children: React.ReactNode }) {
  return <RoleContext value={role}>{children}</RoleContext>;
}

export function useIsAdmin(): boolean {
  return useContext(RoleContext) === "admin";
}
