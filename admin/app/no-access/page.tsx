import { redirect } from "next/navigation";
import { Icon } from "@/components/icons";
import { Notice } from "@/components/notice";
import { SetupNeeded } from "@/components/setup-needed";
import { SignOutButton } from "@/components/sign-out-button";
import { getSession } from "@/lib/auth";

export default async function NoAccessPage() {
  const { user, profile, error } = await getSession();
  if (!user) redirect("/login");
  if (profile && profile.role !== "student") redirect("/");

  const setupMissing = error?.code === "PGRST205" || error?.code === "42P01";
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4 py-12">
      <div className="w-full max-w-md rounded-xl border border-line bg-surface p-8 shadow-card">
        <span className="flex size-10 items-center justify-center rounded-full bg-tint text-primary">
          <Icon name="lock" />
        </span>
        <h1 className="mt-4 text-xl font-semibold tracking-tight">Your account does not have access yet</h1>
        <div className="mt-3 space-y-4">
          {setupMissing ? (
            <SetupNeeded />
          ) : profile?.requested_role === "teacher" ? (
            <p className="text-base text-ink-2">
              Your request for a teacher account is waiting for an admin to approve it. Try again after it has been
              approved.
            </p>
          ) : (
            <p className="text-base text-ink-2">
              This portal is for teachers and admins. Ask an admin to change your role if you need access.
            </p>
          )}
          {error && !setupMissing ? <Notice tone="problem">Your account could not be loaded. Try again in a minute.</Notice> : null}
        </div>
        <p className="mt-6 text-sm text-muted">Signed in as {user.email}.</p>
        <div className="mt-4">
          <SignOutButton />
        </div>
      </div>
    </main>
  );
}
