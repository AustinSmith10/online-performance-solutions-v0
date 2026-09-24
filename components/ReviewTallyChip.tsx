import { formatRoundTally, type RoundSummary } from "@/lib/stakeholders/round-summary";

/** "1 rejected · 1 pending" — reviewer progress for the current round. Renders nothing when there is none. */
export function ReviewTallyChip({ summary, className = "" }: { summary: RoundSummary; className?: string }) {
  const text = formatRoundTally(summary);
  if (!text) return null;
  const tone = summary.rejected > 0 ? "bg-red-50 text-red-700 ring-red-100" : "bg-zinc-50 text-zinc-600 ring-zinc-200";
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${tone} ${className}`}
      title={`Current review round — ${summary.total} reviewer${summary.total === 1 ? "" : "s"}`}
    >
      {text}
    </span>
  );
}
