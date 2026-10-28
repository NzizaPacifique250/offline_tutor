"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Overview" },
  { href: "/users", label: "Users" },
  { href: "/devices", label: "Tablets" },
  { href: "/activity", label: "Activity" },
  { href: "/tutor", label: "Tutor" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-wrap gap-1">
      {links.map(({ href, label }) => {
        const current = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              current ? "bg-brand-600 text-white" : "text-slate-700 hover:bg-slate-200"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
