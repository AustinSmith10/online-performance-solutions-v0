"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Phase = "loading" | "success" | "fading" | "done";

export function SubmissionSuccessBanner({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("success"), 3500);
    const t2 = setTimeout(() => setPhase("fading"), 7000);
    const t3 = setTimeout(() => {
      setPhase("done");
      router.replace(`/portal/projects/${projectId}`, { scroll: false });
    }, 7800);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [projectId, router]);

  if (phase === "done") return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-700 ease-in-out ${
        phase === "fading" ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-white/40 backdrop-blur-sm" />

      {/* Card */}
      <div className="relative z-10 mx-4 w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl ring-1 ring-zinc-200 text-center">
        <div className="flex justify-center mb-5">
          {phase === "loading" ? (
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-50 ring-1 ring-zinc-200">
              <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-zinc-300 border-t-zinc-800" />
            </span>
          ) : (
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-green-50 ring-1 ring-green-200">
              <svg className="h-7 w-7 text-green-600" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                  clipRule="evenodd"
                />
              </svg>
            </span>
          )}
        </div>

        <h2 className="text-base font-semibold text-zinc-900">
          {phase === "loading" ? "Submitting your report request…" : "Request received"}
        </h2>

        <p className="mt-2 text-sm text-zinc-500">
          {phase === "loading"
            ? "Please wait while we finalise your submission."
            : "We’ve received everything. A consultant will be assigned to your report shortly."}
        </p>
      </div>
    </div>
  );
}
