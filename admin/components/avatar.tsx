const sizes = { 24: "size-6 text-xs", 32: "size-8 text-xs", 48: "size-12 text-base" } as const;

type Props = { initials: string; size?: keyof typeof sizes; onDark?: boolean; className?: string };

// Decorative: the name is always written next to it.
export function Avatar({ initials, size = 32, onDark = false, className = "" }: Props) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${sizes[size]} ${
        onDark ? "bg-white/15 text-white" : "bg-tint-strong text-primary"
      } ${className}`}
    >
      {initials}
    </span>
  );
}
