"use client";

import { useRouter } from "next/navigation";

/**
 * #194: surfaces appendRevisionHistoryRow / setCoverRevisionNumber failing
 * to locate their target in an uploaded .docx. The upload itself always
 * still succeeds (never blocks on this) — this just makes the failure
 * visible instead of a server-only console.warn nobody reads. Persistent
 * (no auto-dismiss timer) since it names a real document defect the
 * consultant needs to go fix in Word, unlike the QaUploadedBanner's
 * transient success spotlight.
 */
export function RevisionTablePatchWarningBanner({ warning, cleanUrl }: { warning: string; cleanUrl: string }) {
  const router = useRouter();

  return (
    <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
      <svg className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
      </svg>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-amber-900">Revision table couldn&apos;t be updated</p>
        <p className="mt-0.5 text-sm text-amber-800">
          The upload itself succeeded, but the document&apos;s revision table wasn&apos;t patched: {warning} Check the
          table in Word before this goes out.
        </p>
      </div>
      <button
        type="button"
        onClick={() => router.replace(cleanUrl, { scroll: false })}
        aria-label="Dismiss"
        className="shrink-0 text-amber-500 hover:text-amber-700"
      >
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
        </svg>
      </button>
    </div>
  );
}
