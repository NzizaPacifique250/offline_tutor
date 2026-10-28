import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";

type Props = {
  icon?: IconName;
  title: string;
  body?: string;
  link?: { href: string; label: string };
  compact?: boolean;
  children?: React.ReactNode;
};

export function EmptyState({ icon = "inbox", title, body, link, compact = false, children }: Props) {
  return (
    <div
      className={`rounded-lg border border-dashed border-field bg-surface px-6 text-center ${compact ? "py-6" : "py-10"}`}
    >
      <span className="mx-auto flex size-10 items-center justify-center rounded-full bg-tint text-primary">
        <Icon name={icon} />
      </span>
      <p className="mt-3 text-base font-semibold">{title}</p>
      {body ? <p className="mx-auto mt-1 max-w-md text-sm text-muted">{body}</p> : null}
      {link ? (
        <p className="mt-3 text-sm">
          <Link href={link.href} className="link">
            {link.label}
          </Link>
        </p>
      ) : null}
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}
