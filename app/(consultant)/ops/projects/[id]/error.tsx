"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";

// Route-level boundary: a failure loading one project keeps the consultant
// shell (nav, queue link) instead of falling through to the full-page error.
export default function ProjectError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div role="alert" className="mx-auto mt-16 max-w-md space-y-4 rounded-xl border border-red-200 bg-red-50 p-6 text-center">
      <h1 className="text-base font-semibold text-red-900">This project couldn&apos;t be loaded</h1>
      <p className="text-sm text-red-800">
        The error has been reported. Try again, or go back to your projects and reopen it.
      </p>
      <div className="flex justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2"
        >
          Try again
        </button>
        <Link
          href="/ops"
          className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2"
        >
          My projects
        </Link>
      </div>
    </div>
  );
}
