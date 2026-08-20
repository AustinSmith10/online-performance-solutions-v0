export function ProgressTrack({ pct, tone = "green" }: { pct: number; tone?: "green" | "zinc" }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
      <div
        className={`h-full rounded-full transition-[width] duration-200 ${
          tone === "green" ? "bg-green-500" : "bg-zinc-900"
        }`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
