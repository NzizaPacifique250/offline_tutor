import { Nav } from "@/components/nav";
import { SignOutButton } from "@/components/sign-out-button";
import { requireStaff } from "@/lib/auth";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireStaff();
  return (
    <div className="min-h-screen">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex flex-wrap items-center gap-4">
            <span className="font-semibold">Tutor admin</span>
            <Nav />
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-700">
              {profile.full_name || profile.learner_code} ({profile.role})
            </span>
            <SignOutButton />
          </div>
        </div>
      </div>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
