// Route-level skeleton for the stakeholder project page: header card, rail
// (stage rail + Right now card) and the reference column.

function Bar({ className }: { className: string }) {
  return <div className={`rounded-md bg-zinc-200/70 motion-safe:animate-pulse ${className}`} />;
}

export default function ProjectLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-10" aria-busy="true" aria-label="Loading report request">
      <Bar className="h-4 w-24" />
      <div className="space-y-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <Bar className="h-5 w-2/3" />
          <Bar className="mt-2 h-3 w-1/2" />
        </div>
        <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-[22rem_1fr]">
          <div className="space-y-4">
            <div className="rounded-xl border border-zinc-200 bg-white p-4">
              <Bar className="h-14 w-full" />
            </div>
            <div className="rounded-xl border-2 border-zinc-200 bg-white p-5">
              <Bar className="h-5 w-40" />
              <Bar className="mt-3 h-3 w-full" />
              <Bar className="mt-2 h-3 w-4/5" />
              <Bar className="mt-4 h-9 w-full" />
            </div>
          </div>
          <div className="space-y-4">
            <Bar className="h-10 w-full" />
            <div className="rounded-xl border border-zinc-200 bg-white p-4">
              <Bar className="h-4 w-32" />
              <Bar className="mt-3 h-3 w-full" />
              <Bar className="mt-2 h-3 w-3/4" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
