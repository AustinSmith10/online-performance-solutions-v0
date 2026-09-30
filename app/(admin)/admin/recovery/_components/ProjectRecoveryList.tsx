"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { restoreProject } from "@/app/actions/recovery";
import { PurgeButton } from "./PurgeButton";
import { RestoreButton } from "./RestoreButton";
import { PILL_NEUTRAL } from "./pill";

export type RecoveryProjectRow = {
  id: string;
  label: string;
  meta: string;
  days: number;
};

const CHECKBOX =
  "mt-0.5 h-4 w-4 shrink-0 rounded-sm border-zinc-300 text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 [@media(pointer:coarse)]:h-5 [@media(pointer:coarse)]:w-5";

// Restore is reversible and cheap, so it can be done in bulk. Delete forever
// stays one row at a time on purpose: it is the irreversible one.
export function ProjectRecoveryList({ rows }: { rows: RecoveryProjectRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  function toggle(id: string) {
    setResult(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function restoreSelected() {
    setBusy(true);
    setResult(null);
    const ids = rows.filter((r) => selected.has(r.id)).map((r) => r.id);
    let failed = 0;
    for (const id of ids) {
      try {
        const res = await restoreProject(id, {}, new FormData());
        if (res.error) failed += 1;
      } catch {
        failed += 1;
      }
    }
    setBusy(false);
    setSelected(new Set());
    setResult(
      failed === 0
        ? `Restored ${ids.length} project${ids.length === 1 ? "" : "s"}.`
        : `Restored ${ids.length - failed} of ${ids.length}. ${failed} couldn't be restored, try those again.`
    );
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3 px-1">
        <label className="flex min-h-6 items-center gap-2 text-xs text-zinc-600 [@media(pointer:coarse)]:min-h-10">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() => {
              setResult(null);
              setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
            }}
            className={CHECKBOX}
          />
          Select all
        </label>
        {selected.size > 0 && (
          <>
            <span className="rise-in text-xs tabular-nums text-zinc-500">{selected.size} selected</span>
            <button type="button" onClick={() => void restoreSelected()} disabled={busy} className={`rise-in ${PILL_NEUTRAL}`}>
              {busy ? "Restoring…" : `Restore ${selected.size} selected`}
            </button>
          </>
        )}
        {result && (
          <span role="status" className="text-xs text-zinc-600">
            {result}
          </span>
        )}
      </div>

      <div className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white">
        {rows.map((p) => (
          <div
            key={p.id}
            className={`flex flex-col gap-2 border-l-[3px] px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3 ${
              p.days <= 3 ? "border-l-red-400" : "border-l-zinc-200"
            }`}
          >
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <label className="-m-2 flex shrink-0 p-2 [@media(pointer:coarse)]:-m-3 [@media(pointer:coarse)]:p-3">
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  onChange={() => toggle(p.id)}
                  aria-label={`Select ${p.label}`}
                  className={CHECKBOX}
                />
              </label>
              <div className="min-w-0 flex-1">
                <Link
                  href={`/admin/projects/${p.id}`}
                  className="inline-block break-words text-sm font-medium text-zinc-900 transition-colors duration-150 [@media(pointer:coarse)]:py-1.5 hover:text-zinc-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 sm:truncate"
                >
                  {p.label}
                </Link>
                <p className="mt-0.5 text-xs tabular-nums text-zinc-500 sm:truncate">{p.meta}</p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 pl-7 sm:justify-end sm:pl-0">
              <span
                className={`whitespace-nowrap text-xs font-medium tabular-nums ${
                  p.days <= 3 ? "text-red-700" : "text-zinc-500"
                }`}
              >
                {p.days === 0 ? "Purges today" : `${p.days} ${p.days === 1 ? "day" : "days"} left`}
              </span>
              <div className="flex items-start gap-2">
                <RestoreButton projectId={p.id} label={p.label} />
                <PurgeButton projectId={p.id} label={p.label} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
