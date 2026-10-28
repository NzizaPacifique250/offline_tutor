import { TOTAL_EXERCISES, formatMs } from "@/lib/stats";

export type Segment = { key: string; label: string; count: number; fill: string };

function percent(count: number, total: number): string {
  return total === 0 ? "0%" : `${Math.round((count / total) * 100)}%`;
}

// One stacked bar plus a legend. The legend lists the same numbers as text.
export function StackedBar({ segments, summary }: { segments: Segment[]; summary: string }) {
  const total = segments.reduce((sum, s) => sum + s.count, 0);
  return (
    <div>
      <div aria-hidden="true" className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-tint">
        {segments
          .filter((s) => s.count > 0)
          .map((s) => (
            <div
              key={s.key}
              className={`bar-grow min-w-1 ${s.fill}`}
              style={{ flexGrow: s.count, flexBasis: 0 }}
            />
          ))}
      </div>
      <ul aria-label={summary} className="mt-4 divide-y divide-line text-sm">
        {segments.map((s) => (
          <li key={s.key} className="flex items-center gap-3 py-2">
            <span aria-hidden="true" className={`size-3 shrink-0 rounded-sm ${s.fill}`} />
            <span className="flex-1">{s.label}</span>
            <span className="font-semibold tabular-nums">{s.count}</span>
            <span className="w-10 text-right text-muted tabular-nums">{percent(s.count, total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BarList({ segments }: { segments: Segment[] }) {
  const max = Math.max(1, ...segments.map((s) => s.count));
  const total = segments.reduce((sum, s) => sum + s.count, 0);
  return (
    <ul className="space-y-3 text-sm">
      {segments.map((s) => (
        <li key={s.key} className="grid grid-cols-[6rem_1fr_4rem] items-center gap-3 sm:grid-cols-[7rem_1fr_6rem]">
          <span>{s.label}</span>
          <span aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-tint">
            <span
              className={`bar-grow block h-2 min-w-1 rounded-full ${s.fill} ${s.count === 0 ? "hidden" : ""}`}
              style={{ width: `${(s.count / max) * 100}%` }}
            />
          </span>
          <span className="text-right tabular-nums">
            <span className="font-semibold">{s.count}</span>
            <span className="hidden text-muted sm:inline"> ({percent(s.count, total)})</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

// 80 px bar plus the number as text. The bar is decorative.
export function MiniProgress({ done }: { done: number }) {
  const share = Math.min(1, done / TOTAL_EXERCISES);
  return (
    <div className="flex items-center justify-end gap-3">
      <span aria-hidden="true" className="h-2 w-16 overflow-hidden rounded-full bg-tint">
        <span className="bar-grow block h-2 rounded-full bg-chart-ok" style={{ width: `${share * 100}%` }} />
      </span>
      <span className="tabular-nums">
        {done} of {TOTAL_EXERCISES}
      </span>
    </div>
  );
}

// One pip per exercise. Decorative: the lesson card prints the same facts.
export function Pips({ ids, correct }: { ids: string[]; correct: Set<string> }) {
  return (
    <div aria-hidden="true" className="flex gap-1">
      {ids.map((id) => (
        <span key={id} className={`bar-grow h-2 flex-1 rounded-full ${correct.has(id) ? "bg-ok" : "bg-tint ring-1 ring-inset ring-field"}`} />
      ))}
    </div>
  );
}

export type RangeRow = { key: string; label: string; median: number | null; p95: number | null };

// Median (solid) over 95th percentile (light), all on one shared scale.
export function RangeBars({ rows }: { rows: RangeRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.p95 ?? r.median ?? 0));
  const width = (ms: number | null) => `${((ms ?? 0) / max) * 100}%`;
  return (
    <div>
      <p className="flex flex-wrap items-center gap-4 text-xs text-muted">
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="size-3 rounded-sm bg-primary" /> Median
        </span>
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="size-3 rounded-sm bg-chart-info-soft" /> Slowest 1 in 20
        </span>
      </p>
      <ul className="mt-4 space-y-4">
        {rows.map((r) => (
          <li key={r.key}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 text-sm">
              <span className="max-w-full truncate" title={r.label}>
                {r.label}
              </span>
              <span className="tabular-nums text-ink-2">
                median {formatMs(r.median)}, slowest 1 in 20 {formatMs(r.p95)}
              </span>
            </div>
            <div aria-hidden="true" className="relative mt-2 h-2 overflow-hidden rounded-full bg-tint">
              <span className="bar-grow absolute inset-y-0 left-0 rounded-full bg-chart-info-soft" style={{ width: width(r.p95) }} />
              <span className="bar-grow absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: width(r.median) }} />
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-muted">Scale: 0 to {formatMs(max)}</p>
    </div>
  );
}
