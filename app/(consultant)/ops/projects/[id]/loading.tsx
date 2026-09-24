// Skeleton mirrors the workspace layout (header, stage rail + focus card,
// reference tabs) so navigating from the queue shows structure immediately.
function Bar({ className }: { className: string }) {
  return <div className={`rounded bg-zinc-200/70 motion-safe:animate-pulse ${className}`} />;
}

export default function Loading() {
  return (
    <div className="space-y-4" role="status" aria-live="polite">
      <span className="sr-only">Loading project…</span>
      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <Bar className="h-5 w-2/3" />
        <div className="mt-4 flex gap-6 border-t border-zinc-100 pt-3">
          <Bar className="h-4 w-16" />
          <Bar className="h-4 w-28" />
          <Bar className="h-4 w-28" />
        </div>
      </div>
      <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-[25rem_1fr]">
        <div className="space-y-4">
          <div className="rounded-xl border border-zinc-200 bg-white p-5">
            <Bar className="h-9 w-full" />
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-5 space-y-3">
            <Bar className="h-5 w-1/2" />
            <Bar className="h-4 w-3/4" />
            <Bar className="h-24 w-full" />
          </div>
        </div>
        <div className="space-y-3">
          <Bar className="h-9 w-full" />
          <div className="rounded-lg border border-zinc-200 bg-white p-5 space-y-3">
            <Bar className="h-4 w-1/3" />
            <Bar className="h-4 w-full" />
            <Bar className="h-4 w-5/6" />
            <Bar className="h-4 w-2/3" />
          </div>
        </div>
      </div>
    </div>
  );
}
