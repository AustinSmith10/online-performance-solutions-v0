"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function Error({
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
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="text-sm text-gray-600">
          The error has been reported. Try again, or contact support if it persists.
        </p>
        <button
          onClick={reset}
          className="rounded-md bg-gray-900 text-white px-4 py-2 text-sm"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
