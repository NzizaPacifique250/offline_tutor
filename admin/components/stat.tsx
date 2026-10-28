type Props = { label: string; value: string | number; note?: string; className?: string };

export function StatCard({ label, value, note, className = "border-line bg-surface" }: Props) {
  return (
    <div className={`rounded-lg border p-5 shadow-card ${className}`}>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd>
      {note ? <dd className="mt-1 text-xs text-ink-2">{note}</dd> : null}
    </div>
  );
}
