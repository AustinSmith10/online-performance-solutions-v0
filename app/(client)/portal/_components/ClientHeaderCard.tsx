// Status header card shared by /portal/submit and /portal/projects/[id].
// Deliberately has no "Overdue" indicator — a client isn't the one who
// should feel due-date pressure; that's tracked internally, not surfaced here.

export function ClientHeaderCard({
  title,
  subtitle,
  statusLabel,
  roundBadge,
}: {
  title: string;
  subtitle: React.ReactNode;
  statusLabel?: string;
  roundBadge?: number | null;
}) {
  return (
    <div className="rounded-xl border border-l-[3px] border-zinc-200 border-l-blue-400 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold text-zinc-900">{title}</h1>
          <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {!!roundBadge && roundBadge > 1 && (
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
              Round {roundBadge}
            </span>
          )}
          {statusLabel && (
            <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700">
              {statusLabel}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
