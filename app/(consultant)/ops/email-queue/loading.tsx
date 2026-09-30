// Shown while the email queue renders on the server, so a click on the header
// link changes the screen straight away instead of after the whole page loads.
function Bar({ className }: { className: string }) {
  return <div className={`rounded bg-zinc-200/70 motion-safe:animate-pulse ${className}`} />;
}

export default function Loading() {
  return (
    <div className="space-y-5" role="status" aria-live="polite">
      <span className="sr-only">Loading the email queue…</span>
      <Bar className="h-7 w-40" />
      <div className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center justify-between gap-4 px-4 py-3.5">
            <div className="min-w-0 flex-1 space-y-2">
              <Bar className="h-4 w-2/5" />
              <Bar className="h-3 w-3/5" />
            </div>
            <Bar className="h-6 w-20 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
