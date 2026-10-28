import type { DayCount } from "@/lib/stats";

// Seven small columns on the dark hero card, with the weekday under each bar and the
// highest day above. The text list is the equivalent for screen readers.
export function WeekBars({ days }: { days: DayCount[] }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  return (
    <div>
      <p aria-hidden="true" className="mb-1 text-right text-xs text-white/85 tabular-nums">
        max {max}
      </p>
      <div aria-hidden="true" className="flex h-12 items-end gap-1">
        {days.map((d) => (
          <span
            key={d.label}
            className="rise min-h-0.5 flex-1 rounded-sm bg-white/70"
            style={{ height: `${Math.max(4, (d.count / max) * 100)}%`, opacity: d.count === 0 ? 0.35 : 1 }}
          />
        ))}
      </div>
      <div aria-hidden="true" className="mt-1 flex gap-1 text-xs text-white/85">
        {days.map((d) => (
          <span key={d.label} className="flex-1 text-center">
            {d.label.slice(0, 2)}
          </span>
        ))}
      </div>
      <ul className="sr-only">
        {days.map((d) => (
          <li key={d.label}>
            {d.label}: {d.count} attempts
          </li>
        ))}
      </ul>
    </div>
  );
}
