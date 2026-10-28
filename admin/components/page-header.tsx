type Props = { title: string; description?: string; problem?: string | null };

export function PageHeader({ title, description, problem }: Props) {
  return (
    <header className="mb-6 space-y-3">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {description ? <p className="text-slate-600">{description}</p> : null}
      {problem ? (
        <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {problem}
        </p>
      ) : null}
    </header>
  );
}
