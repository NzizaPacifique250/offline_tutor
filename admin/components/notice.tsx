type Props = { tone?: "problem" | "info" | "success"; children: React.ReactNode };

const tones = {
  problem: "border-amber-300 bg-amber-50 text-amber-950",
  info: "border-slate-300 bg-white text-slate-700",
  success: "border-emerald-300 bg-emerald-50 text-emerald-950",
};

export function Notice({ tone = "info", children }: Props) {
  return (
    <p role={tone === "problem" ? "alert" : "status"} className={`rounded-md border px-4 py-3 text-sm ${tones[tone]}`}>
      {children}
    </p>
  );
}
