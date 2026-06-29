"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function NumberSavedBanner({ cleanUrl }: { cleanUrl: string }) {
  const router = useRouter();
  const [visible, setVisible] = useState(true);
  const pbdbRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    // Scroll PBDB section into view and briefly highlight it
    const el = document.getElementById("pbdb-section");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-green-400", "ring-offset-2");
      setTimeout(() => el.classList.remove("ring-2", "ring-green-400", "ring-offset-2"), 2500);
    }
    pbdbRef.current = el;

    const t1 = setTimeout(() => setVisible(false), 3500);
    const t2 = setTimeout(() => router.replace(cleanUrl, { scroll: false }), 4200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [cleanUrl, router]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/30">
      <div className="mx-4 w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 shadow-xl text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
          <svg className="h-6 w-6 text-green-600" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
          </svg>
        </div>
        <p className="text-base font-semibold text-zinc-900">Project number saved</p>
        <p className="mt-2 text-sm text-zinc-500">
          Your PBDB has been generated — find it in the PBDB section below.
        </p>
        <button
          type="button"
          onClick={() => {
            setVisible(false);
            router.replace(cleanUrl, { scroll: false });
            pbdbRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
          className="mt-6 w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
