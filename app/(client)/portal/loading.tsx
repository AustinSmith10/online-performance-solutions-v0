// Route-level skeleton for /portal: same rhythm as the loaded page (title row,
// tile strip, banner, list controls, request rows) so nothing shifts on load.

function Bar({ className }: { className: string }) {
  return <div className={`rounded-md bg-zinc-200/70 motion-safe:animate-pulse ${className}`} />;
}

export default function PortalLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading your report requests">
      <div className="flex items-center justify-between gap-3">
        <Bar className="h-7 w-56" />
        <Bar className="h-9 w-40" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-zinc-200 bg-white p-4">
            <Bar className="h-7 w-10" />
            <Bar className="mt-2 h-3 w-24" />
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3">
        <Bar className="h-4 w-2/3" />
      </div>
      <Bar className="h-9 w-full max-w-md" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-xl border border-zinc-200 bg-white p-5">
          <Bar className="h-5 w-3/5" />
          <Bar className="mt-2 h-3 w-2/5" />
          <div className="mt-4 border-t border-zinc-100 pt-4">
            <Bar className="h-7 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
