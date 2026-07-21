export function FocusCard({
  tone,
  title,
  subtitle,
  children,
  id,
}: {
  tone: "neutral" | "amber" | "red" | "green";
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  id?: string;
}) {
  const toneClasses = {
    neutral: "border-blue-300 bg-blue-50 shadow-sm shadow-blue-100",
    amber: "border-amber-300 bg-amber-50",
    red: "border-red-300 bg-red-50",
    green: "border-green-300 bg-green-50",
  }[tone];
  const titleClasses = {
    neutral: "text-blue-900",
    amber: "text-amber-900",
    red: "text-red-900",
    green: "text-green-900",
  }[tone];

  return (
    <div id={id} className={`rounded-xl border-2 p-5 ${toneClasses}`}>
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Right now</p>
        <h2 className={`mt-0.5 text-lg font-semibold ${titleClasses}`}>{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
