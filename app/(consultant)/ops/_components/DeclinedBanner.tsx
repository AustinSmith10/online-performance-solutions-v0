"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function DeclinedBanner() {
  const router = useRouter();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t1 = setTimeout(() => setVisible(false), 3500);
    const t2 = setTimeout(() => router.replace("/ops", { scroll: false }), 4200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [router]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/30">
      <div className="mx-4 w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 shadow-xl text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100">
          <svg className="h-6 w-6 text-zinc-500" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
          </svg>
        </div>
        <p className="text-base font-semibold text-zinc-900">Assignment declined</p>
        <p className="mt-2 text-sm text-zinc-500">
          This project has returned to the unassigned pool and the admin team has been notified.
        </p>
        <button
          type="button"
          onClick={() => { setVisible(false); router.replace("/ops", { scroll: false }); }}
          className="mt-6 w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
