type Props = { title: string; children: React.ReactNode };

export function Section({ title, children }: Props) {
  return (
    <section className="mt-8">
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}
