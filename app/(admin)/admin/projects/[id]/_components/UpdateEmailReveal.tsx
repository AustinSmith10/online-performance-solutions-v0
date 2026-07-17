"use client";

import { useState } from "react";
import { UpdateEmailForm } from "./UpdateEmailForm";

// Compact trigger wrapper around UpdateEmailForm — the form itself always
// renders its email input inline (by design, for the dashboard ActionPanel's
// own expand/collapse state), which is too wide to sit alongside the other
// per-stakeholder action buttons in the project detail page's FocusCard.
// Kept local rather than changing UpdateEmailForm itself so ActionPanel's
// existing behaviour isn't touched.
export function UpdateEmailReveal({
  reviewId,
  projectId,
  currentEmail,
}: {
  reviewId: string;
  projectId: string;
  currentEmail: string;
}) {
  const [open, setOpen] = useState(false);

  if (open) {
    return (
      <div className="flex items-center gap-2">
        <UpdateEmailForm reviewId={reviewId} projectId={projectId} currentEmail={currentEmail} />
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-zinc-400 hover:text-zinc-600">
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
    >
      Update email
    </button>
  );
}
