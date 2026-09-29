"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// `baseHref` is the current audit URL minus its page param, so filters and
// sort survive the jump.
export function JumpToPage({
  baseHref,
  current,
  totalPages,
}: {
  baseHref: string;
  current: number;
  totalPages: number;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");

  function go(e: React.FormEvent) {
    e.preventDefault();
    const n = Math.min(totalPages, Math.max(1, parseInt(value, 10) || 0));
    if (!n || n === current + 1) return;
    const base = baseHref.replace(/\?$/, "");
    const sep = base.includes("?") ? "&" : "?";
    router.push(n === 1 ? base : `${base}${sep}page=${n - 1}`);
    setValue("");
  }

  return (
    <form onSubmit={go} className="flex items-center gap-2">
      <label htmlFor="audit-jump" className="text-xs text-zinc-500">
        Go to page
      </label>
      <input
        id="audit-jump"
        type="number"
        inputMode="numeric"
        min={1}
        max={totalPages}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-16 rounded-md border border-zinc-300 px-2 py-1 text-sm tabular-nums focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
      />
      <button
        type="submit"
        disabled={!value}
        className="press rounded-md border border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-700 transition-colors duration-150 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:opacity-50 [@media(pointer:coarse)]:min-h-10"
      >
        Go
      </button>
    </form>
  );
}
