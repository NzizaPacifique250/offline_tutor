"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};
const options: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" };

// Server and first client render show UTC so they match; the browser then
// switches to the viewer's own time zone.
export function LocalTime({ iso }: { iso: string | null }) {
  const text = useSyncExternalStore(
    noopSubscribe,
    () => (iso ? new Date(iso).toLocaleString("en-GB", options) : "–"),
    () => (iso ? `${new Date(iso).toLocaleString("en-GB", { ...options, timeZone: "UTC" })} UTC` : "–"),
  );
  if (!iso) return <span>–</span>;
  return <time dateTime={iso}>{text}</time>;
}
