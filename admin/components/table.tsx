type TableProps = { caption: string; head: string[]; empty: string; isEmpty: boolean; children: React.ReactNode };

// A scrollable, semantic table. `caption` is visible to screen readers only.
export function Table({ caption, head, empty, isEmpty, children }: TableProps) {
  if (isEmpty) {
    return <p className="rounded-md border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600">{empty}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-max text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-slate-100 text-slate-700">
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, numeric = false }: { children: React.ReactNode; numeric?: boolean }) {
  return <td className={`px-3 py-2 align-top ${numeric ? "text-right tabular-nums" : ""}`}>{children}</td>;
}
