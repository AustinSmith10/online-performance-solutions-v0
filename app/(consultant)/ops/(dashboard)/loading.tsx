// Skeleton for the consultant dashboard only. It lives in the (dashboard)
// route group so it does not apply to Email Queue, Profile or project pages.
function Bar({ className }: { className: string }) {
  return <div className={`rounded bg-zinc-200/70 motion-safe:animate-pulse ${className}`} />;
}

export default function Loading() {
  return (
    <div className="space-y-5" role="status" aria-live="polite">
      <span className="sr-only">Loading your projects…</span>
      <div className="flex items-center justify-between">
        <Bar className="h-7 w-40" />
        <Bar className="h-9 w-32" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-zinc-200 bg-white p-4">
            <Bar className="h-7 w-8" />
            <Bar className="mt-2 h-3 w-24" />
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3">
        <Bar className="h-4 w-2/3" />
      </div>
      <div className="rounded-lg border border-zinc-200 bg-white p-1">
        <Bar className="h-8 w-full" />
      </div>
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-xl border border-zinc-200 bg-white p-5">
            <Bar className="h-5 w-3/5" />
            <Bar className="mt-3 h-3 w-1/3" />
            <Bar className="mt-2 h-3 w-1/4" />
          </div>
        ))}
      </div>
    </div>
  );
}
