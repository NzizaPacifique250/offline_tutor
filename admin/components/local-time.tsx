import { kigaliDateTime } from "@/lib/stats";

// Kigali time, formatted on the server so it never changes after the page loads.
export function LocalTime({ iso }: { iso: string | null }) {
  if (!iso) return <span>–</span>;
  return <time dateTime={iso}>{kigaliDateTime(iso)}</time>;
}
