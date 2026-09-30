// Shown while the profile page renders on the server (see email-queue/loading.tsx).
function Bar({ className }: { className: string }) {
  return <div className={`rounded bg-zinc-200/70 motion-safe:animate-pulse ${className}`} />;
}

export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl space-y-5" role="status" aria-live="polite">
      <span className="sr-only">Loading your profile…</span>
      <Bar className="h-7 w-36" />
      <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-2">
            <Bar className="h-3 w-24" />
            <Bar className="h-9 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
