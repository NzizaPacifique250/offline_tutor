type Props = {
  title?: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
};

export function Card({ title, action, className = "", children }: Props) {
  return (
    <section className={`rounded-lg border border-line bg-surface p-5 shadow-card ${className}`}>
      {title || action ? (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title ? <h2 className="text-base font-semibold">{title}</h2> : <span />}
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}
