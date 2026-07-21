export function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">{title}</h2>
        <p className="mt-0.5 text-xs text-zinc-400">{description}</p>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
