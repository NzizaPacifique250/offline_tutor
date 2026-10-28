type Props = { label: string; value: string | number; note?: string };

export function Stat({ label, value, note }: Props) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <dt className="text-sm text-slate-600">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
      {note ? <dd className="mt-1 text-xs text-slate-600">{note}</dd> : null}
    </div>
  );
}
