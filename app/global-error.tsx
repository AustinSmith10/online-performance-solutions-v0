"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

// Catches errors that escape every route's error.tsx — a crash in the root
// layout itself. Must render its own <html>/<body>: it replaces the whole
// tree, including the layout that would normally provide them.
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen flex items-center justify-center p-8">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="text-sm text-gray-600">
            The error has been reported. Please refresh, or contact support if it persists.
          </p>
        </div>
      </body>
    </html>
  );
}
