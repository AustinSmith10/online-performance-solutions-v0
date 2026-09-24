// The one Overdue pill: outlined red with a clock and, when known, the whole
// calendar days overdue. Used on the consultant dashboard, the project header,
// the "Right now" picker and the admin lists so the same state always looks the
// same. Colour is never the only cue: the icon and text carry it too.
export function OverduePill({ days, className = "" }: { days?: number; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-red-300 bg-white px-2 py-0.5 text-xs font-medium tabular-nums text-red-700 ${className}`}
    >
      <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z"
          clipRule="evenodd"
        />
      </svg>
      Overdue{days && days > 0 ? ` · ${days}d` : ""}
    </span>
  );
}
