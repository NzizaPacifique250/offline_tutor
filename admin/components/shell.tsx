import { Avatar } from "@/components/avatar";
import { Nav } from "@/components/nav";
import { SignOutButton } from "@/components/sign-out-button";
import { initials } from "@/lib/ui";

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false" className="shrink-0">
      <rect width="32" height="32" rx="8" fill="#fff" />
      <rect x="8" y="16" width="4" height="8" rx="1" fill="#14467E" />
      <rect x="14" y="10" width="4" height="14" rx="1" fill="#14467E" />
      <rect x="20" y="4" width="4" height="20" rx="1" fill="#14467E" />
    </svg>
  );
}

type Props = {
  name: string;
  code: string;
  role: string;
  children: React.ReactNode;
};

// Sidebar on wide screens; slim top bar plus bottom tabs below 1024 px.
export function Shell({ name, code, role, children }: Props) {
  const display = name || code;
  const letters = initials(name, code);
  return (
    <>
      <a
        href="#content"
        className="btn sr-only bg-white text-primary shadow-pop ring-2 ring-white focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50"
      >
        Skip to content
      </a>

      <aside className="on-primary fixed inset-y-0 left-0 hidden w-60 flex-col bg-primary px-4 py-6 text-white lg:flex">
        <div className="flex items-center gap-3">
          <Logo />
          <div className="min-w-0">
            <p className="text-base font-semibold">Tutor admin</p>
            <p className="text-xs text-white/75">Senior Six Advanced Mathematics</p>
          </div>
        </div>
        <Nav variant="sidebar" role={role} />
        <div className="mt-auto">
          <div className="mb-3 flex items-center gap-3">
            <Avatar initials={letters} onDark />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{display}</p>
              <p className="text-xs text-white/75 capitalize">{role}</p>
            </div>
          </div>
          <SignOutButton variant="sidebar" />
        </div>
      </aside>

      <div className="lg:pl-60">
        <header className="on-primary sticky top-0 z-30 flex h-14 items-center justify-between bg-primary px-4 text-white lg:hidden">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="text-base font-semibold">Tutor admin</span>
          </div>
          <details className="relative">
            <summary
              aria-label={`Account menu for ${display}`}
              className="flex size-10 cursor-pointer list-none items-center justify-center rounded-full [&::-webkit-details-marker]:hidden"
            >
              <Avatar initials={letters} onDark />
            </summary>
            <div className="menu-panel absolute top-11 right-0 w-64 rounded-lg bg-surface p-4 text-ink shadow-pop">
              <p className="truncate text-sm font-semibold">{display}</p>
              <p className="mb-4 text-xs text-muted capitalize">{role}</p>
              <SignOutButton />
            </div>
          </details>
        </header>

        <main id="content" className="mx-auto w-full max-w-6xl px-4 py-6 pb-24 md:px-6 lg:px-8 lg:py-8 lg:pb-8">
          {children}
        </main>
      </div>

      <Nav variant="tabs" role={role} />
    </>
  );
}
