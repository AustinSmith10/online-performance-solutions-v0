// Shown while any admin page renders on the server. Without it a sidebar click
// changes nothing on screen until the whole next page is ready, which is what
// makes every route feel slow. The layout (sidebar, tray) stays in place; only
// the page area is replaced. It is deliberately generic: a title, a filter
// strip and a list of rows, which is the shape of most admin pages.
function Bar({ className }: { className: string }) {
  return <div className={`rounded-md bg-zinc-200/70 motion-safe:animate-pulse ${className}`} />;
}

export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl space-y-6" role="status" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Bar className="h-6 w-44" />
          <Bar className="h-3.5 w-72 max-w-full" />
        </div>
        <Bar className="hidden h-9 w-32 sm:block" />
      </div>
      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex flex-wrap gap-3">
          <Bar className="h-9 w-56 max-w-full" />
          <Bar className="h-9 w-32" />
          <Bar className="h-9 w-24" />
        </div>
      </div>
      <div className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white">
        {[0, 1, 2, 3, 4, 5].map((i) => (
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
