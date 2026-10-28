import { Icon, type IconName } from "@/components/icons";

export type Tone = "ok" | "warn" | "bad" | "info" | "neutral";

const tones: Record<Tone, string> = {
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  info: "bg-tint text-primary",
  neutral: "bg-tint text-ink-2",
};

type Props = { tone: Tone; icon?: IconName; children: React.ReactNode };

export function Badge({ tone, icon, children }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset ring-current/15 ${tones[tone]}`}
    >
      {icon ? <Icon name={icon} size={12} /> : null}
      {children}
    </span>
  );
}
