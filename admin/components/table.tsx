import { EmptyState } from "@/components/empty-state";
import type { IconName } from "@/components/icons";

type HeadItem = string | { label: string; numeric?: true };

type Empty = { title: string; body?: string; icon?: IconName; link?: { href: string; label: string } };

type TableProps = {
  caption: string;
  head: HeadItem[];
  empty: Empty;
  isEmpty: boolean;
  children: React.ReactNode;
};

// A scrollable, semantic table. `caption` is visible to screen readers only.
// The wrapper is focusable so keyboard users can scroll it sideways.
export function Table({ caption, head, empty, isEmpty, children }: TableProps) {
  if (isEmpty) return <EmptyState {...empty} />;
  return (
    <div
      role="region"
      aria-label={caption}
      tabIndex={0}
      className="scroll-hint overflow-x-auto rounded-lg border border-line shadow-card"
    >
      <table className="data-table w-full min-w-max text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-tint">
          <tr>
            {head.map((h) => {
              const { label, numeric } = typeof h === "string" ? { label: h, numeric: false } : { numeric: false, ...h };
              return (
                <th
                  key={label}
                  scope="col"
                  className={`px-4 py-3 text-xs font-semibold text-muted ${numeric ? "text-right" : ""}`}
                >
                  {label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

type TdProps = { children: React.ReactNode; numeric?: boolean; rowHeader?: boolean };

// `rowHeader` marks the first cell of a row as its header for screen readers.
export function Td({ children, numeric = false, rowHeader = false }: TdProps) {
  if (rowHeader) return <th scope="row">{children}</th>;
  return <td className={numeric ? "text-right tabular-nums" : ""}>{children}</td>;
}
