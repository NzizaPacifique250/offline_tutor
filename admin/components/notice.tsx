import { Icon, type IconName } from "@/components/icons";

type Props = { tone?: "problem" | "info" | "success"; id?: string; lead?: string; children: React.ReactNode };

const tones: Record<NonNullable<Props["tone"]>, { box: string; icon: IconName; iconColor: string }> = {
  problem: { box: "border-warn/30 bg-warn-soft", icon: "alert", iconColor: "text-warn" },
  info: { box: "border-line bg-surface", icon: "info", iconColor: "text-primary" },
  success: { box: "border-ok/30 bg-ok-soft", icon: "check", iconColor: "text-ok" },
};

export function Notice({ tone = "info", id, lead, children }: Props) {
  const t = tones[tone];
  return (
    <div
      id={id}
      role={tone === "problem" ? "alert" : "status"}
      className={`fade flex gap-3 rounded-lg border p-4 text-sm text-ink ${t.box}`}
    >
      <Icon name={t.icon} className={`mt-0.5 shrink-0 ${t.iconColor}`} />
      <p>
        {lead ? <strong className="font-semibold">{lead} </strong> : null}
        {children}
      </p>
    </div>
  );
}
