// Status header card shared by /portal/submit and /portal/projects/[id].
// Deliberately has no "Overdue" indicator — a client isn't the one who
// should feel due-date pressure; that's tracked internally, not surfaced here.

export function ClientHeaderCard({
  title,
  subtitle,
  statusLabel,
  roundBadge,
  tone = "neutral",
}: {
  title: string;
  subtitle?: React.ReactNode;
  statusLabel?: string;
  roundBadge?: number | null;
  // Mirrors the Right now card's tone so the header never says "in progress"
  // while the card below asks the viewer to act.
  tone?: "neutral" | "amber" | "green";
}) {
  const edge = { neutral: "border-l-blue-400", amber: "border-l-amber-400", green: "border-l-green-500" }[tone];
  const pill = {
    neutral: "bg-blue-100 text-blue-700",
    amber: "bg-amber-100 text-amber-800",
    green: "bg-green-100 text-green-700",
  }[tone];
  return (
    <div className={`rounded-xl border border-l-[3px] border-zinc-200 bg-white p-5 ${edge}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <h1 className="text-base font-semibold text-zinc-900">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!!roundBadge && roundBadge > 1 && (
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
              Round {roundBadge}
            </span>
          )}
          {statusLabel && (
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${pill}`}>
              {statusLabel}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
