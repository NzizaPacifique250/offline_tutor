"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/icons";

const allLinks: { href: string; label: string; icon: IconName; adminOnly?: true }[] = [
  { href: "/", label: "Overview", icon: "overview" },
  { href: "/users", label: "Users", icon: "users" },
  { href: "/classes", label: "Classes", icon: "classes" },
  { href: "/devices", label: "Tablets", icon: "tablet", adminOnly: true },
  { href: "/activity", label: "Activity", icon: "activity" },
  { href: "/tutor", label: "Tutor", icon: "tutor" },
];

// Static class names, so Tailwind generates them.
const TAB_COLUMNS: Record<number, string> = { 5: "grid-cols-5", 6: "grid-cols-6" };

// One link list, two layouts: the sidebar on wide screens, the tab bar below 1024 px.
// Teachers do not see the Tablets page, which is for admins.
export function Nav({ variant, role }: { variant: "sidebar" | "tabs"; role: string }) {
  const pathname = usePathname();
  const links = allLinks.filter((l) => !l.adminOnly || role === "admin");
  const isCurrent = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  if (variant === "sidebar") {
    return (
      <nav aria-label="Main" className="mt-8 flex flex-col gap-1">
        {links.map(({ href, label, icon }) => {
          const current = isCurrent(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={current ? "page" : undefined}
              className={`relative flex h-10 items-center gap-3 rounded-md px-3 text-sm transition-colors duration-150 active:bg-white/20 ${
                current
                  ? "bg-white/15 font-semibold text-white before:absolute before:inset-y-2.5 before:-left-4 before:w-1 before:rounded-full before:bg-white before:content-['']"
                  : "font-medium text-white/80 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icon name={icon} />
              {label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav
      aria-label="Main"
      className={`pb-[env(safe-area-inset-bottom)] fixed inset-x-0 bottom-0 z-30 grid h-16 ${TAB_COLUMNS[links.length] ?? "grid-cols-6"} border-t border-line bg-surface lg:hidden`}
    >
      {links.map(({ href, label, icon }) => {
        const current = isCurrent(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            className={`relative flex h-full min-h-12 min-w-16 flex-col items-center justify-center gap-1 text-xs transition-colors duration-150 active:bg-tint ${
              current
                ? "font-semibold text-primary before:absolute before:top-0 before:h-1 before:w-6 before:rounded-full before:bg-primary before:content-['']"
                : "font-medium text-muted hover:text-ink"
            }`}
          >
            <Icon name={icon} size={24} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
