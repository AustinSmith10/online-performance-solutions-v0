"use client";

import { useState } from "react";

// Two-step "Mark resolved": resolving hides the entry until the underlying
// issue recurs, so it asks once before doing it. `onResolve` returns false (or
// throws) when the request failed, and the row stays put with an inline note.
export function ConfirmResolveButton({ onResolve }: { onResolve: () => Promise<boolean> }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleConfirm() {
    setPending(true);
    setFailed(false);
    let ok = false;
    try {
      ok = await onResolve();
    } catch {
      ok = false;
    }
    if (!ok) {
      setFailed(true);
      setPending(false);
    }
    // On success the parent refreshes and this row unmounts.
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="press shrink-0 rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 transition-colors duration-150 hover:bg-green-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 [@media(pointer:coarse)]:min-h-10 [@media(pointer:coarse)]:px-3"
      >
        Mark resolved
      </button>
    );
  }

  return (
    <div className="rise-in flex shrink-0 flex-col items-end gap-1.5">
      <p className="text-xs text-zinc-600">Hide until it recurs?</p>
      {failed && (
        <p role="alert" className="text-xs text-red-700">
          Couldn&apos;t resolve. Try again.
        </p>
      )}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            setFailed(false);
          }}
          disabled={pending}
          className="press rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-600 transition-colors duration-150 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 [@media(pointer:coarse)]:min-h-10 [@media(pointer:coarse)]:px-3"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void handleConfirm()}
          disabled={pending}
          className="press rounded-full border border-green-700 bg-green-700 px-2.5 py-1 text-xs font-medium text-white transition-colors duration-150 hover:bg-green-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 disabled:opacity-50 [@media(pointer:coarse)]:min-h-10 [@media(pointer:coarse)]:px-3"
        >
          {pending ? "Resolving…" : "Resolve"}
        </button>
      </div>
    </div>
  );
}
