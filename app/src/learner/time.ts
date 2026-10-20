/**
 * SQLite stamps rows with datetime('now'), which is UTC in the form
 * "YYYY-MM-DD HH:MM:SS". Screens show it in the device's local time without
 * relying on Intl, which Hermes implements only partially.
 */

// Progress files from other tablets carry ISO 8601 UTC ("2026-10-20T08:42:05.123Z"), read the same way.
export function parseSqliteUtc(stamp: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z?$/.exec(stamp);
  if (!m) {
    return null;
  }
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
}

const two = (n: number) => String(n).padStart(2, '0');

/** "28 Sep, 17:42" in local time, or the raw stamp when it cannot be parsed. */
export function formatWhen(stamp: string, now: Date = new Date()): string {
  const d = parseSqliteUtc(stamp);
  if (!d) {
    return stamp;
  }
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const time = `${two(d.getHours())}:${two(d.getMinutes())}`;
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  return sameDay ? `Today, ${time}` : `${d.getDate()} ${months[d.getMonth()]}, ${time}`;
}
