const CIRCUMFERENCE = 251.33;

type Props = {
  part: number;
  total: number;
  /** Tailwind stroke class for the filled arc. */
  stroke?: string;
  /** Spoken summary, for example "72 percent correct". */
  label: string;
  size?: number;
};

// Server-rendered progress ring. With no total it shows the track and a dash.
export function Ring({ part, total, stroke = "stroke-chart-ok", label, size = 96 }: Props) {
  const share = total > 0 ? Math.min(1, Math.max(0, part / total)) : 0;
  const dash = share * CIRCUMFERENCE;
  return (
    <svg
      viewBox="0 0 96 96"
      width={size}
      height={size}
      role="img"
      aria-label={total > 0 ? label : "No data yet"}
      className="shrink-0"
    >
      <circle cx="48" cy="48" r="40" fill="none" strokeWidth="10" className="stroke-line" />
      {share > 0 ? (
        <circle
          cx="48"
          cy="48"
          r="40"
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${CIRCUMFERENCE}`}
          transform="rotate(-90 48 48)"
          className={`ring-fill ${stroke}`}
          style={{ "--dash": dash } as React.CSSProperties}
        />
      ) : null}
      <text
        x="48"
        y="48"
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-ink text-[20px] font-semibold"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {total > 0 ? `${Math.round(share * 100)}%` : "–"}
      </text>
    </svg>
  );
}
