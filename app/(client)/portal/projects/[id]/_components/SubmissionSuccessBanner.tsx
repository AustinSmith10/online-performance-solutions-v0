"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SubmissionSuccessBanner({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [closing, setClosing] = useState(false);

  function handleClose() {
    setClosing(true);
    router.replace(`/portal/projects/${projectId}`, { scroll: false });
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-200 ease-in-out ${
        closing ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-white/40 backdrop-blur-sm" />

      {/* Card */}
      <div className="relative z-10 mx-4 w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl ring-1 ring-zinc-200 text-center">
        <div className="flex justify-center mb-5">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-green-50 ring-1 ring-green-200">
            <svg className="h-7 w-7 text-green-600" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                clipRule="evenodd"
              />
            </svg>
          </span>
        </div>

        <h2 className="text-base font-semibold text-zinc-900">Request received</h2>

        <p className="mt-2 text-sm text-zinc-500">
          We’ve received everything. A consultant will be assigned to your report shortly.
        </p>

        <button
          type="button"
          onClick={handleClose}
          className="mt-6 w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
        >
          Close
        </button>
      </div>
    </div>
  );
}
