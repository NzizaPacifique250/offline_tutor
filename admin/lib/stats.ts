// Nearest-rank percentile. `values` need not be sorted. Returns null when empty.
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1] ?? null;
}

export function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "–";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
}

export function formatShare(part: number, total: number): string {
  return total === 0 ? "–" : `${Math.round((part / total) * 100)}%`;
}

// ISO timestamp for "n days ago". Kept out of components so renders stay pure.
export function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}
