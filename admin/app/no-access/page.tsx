import { redirect } from "next/navigation";
import { Notice } from "@/components/notice";
import { SignOutButton } from "@/components/sign-out-button";
import { getSession } from "@/lib/auth";
import { SETUP_MESSAGE } from "@/lib/query";

export default async function NoAccessPage() {
  const { user, profile, error } = await getSession();
  if (!user) redirect("/login");
  if (profile && profile.role !== "student") redirect("/");

  const setupMissing = error?.code === "PGRST205" || error?.code === "42P01";
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-4">
      <h1 className="text-2xl font-semibold tracking-tight">Your account does not have access yet</h1>
      {setupMissing ? (
        <Notice tone="problem">{SETUP_MESSAGE}</Notice>
      ) : profile?.requested_role === "teacher" ? (
        <p className="text-slate-700">
          Your request for a teacher account is waiting for an admin to approve it. Try again after it has been approved.
        </p>
      ) : (
        <p className="text-slate-700">
          This portal is for teachers and admins. Ask an admin to change your role if you need access.
        </p>
      )}
      {error && !setupMissing ? <Notice tone="problem">{error.message}</Notice> : null}
      <p className="text-sm text-slate-600">Signed in as {user.email}.</p>
      <div>
        <SignOutButton />
      </div>
    </main>
  );
}
