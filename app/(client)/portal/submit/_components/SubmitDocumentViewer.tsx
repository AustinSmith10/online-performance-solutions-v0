"use client";

import { useState } from "react";
import { DocumentViewer } from "@/components/DocumentViewer";

export interface SubmitDocument {
  slug: string;
  label: string;
  name: string;
  previewUrl: string | null;
}

/**
 * Sticky document card shown beside the extracted fields (#210), so a reviewer
 * can check a value against the source without leaving the Overview tab. Shared
 * by the portal, consultant and admin submit pages through SubmissionForm.
 * Wraps the existing DocumentViewer, so PDF rendering and the unsupported-type
 * fallback are unchanged. A file switcher appears only for multiple uploads.
 */
export function SubmitDocumentViewer({ documents }: { documents: SubmitDocument[] }) {
  const viewable = documents.filter((d) => d.previewUrl);
  const [slug, setSlug] = useState<string | null>(null);
  if (viewable.length === 0) return null;

  const current = viewable.find((d) => d.slug === slug) ?? viewable[0];

  return (
    <section
      aria-label="Document viewer"
      className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white"
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-100 px-3 py-2">
        {viewable.length > 1 ? (
          <select
            aria-label="Choose document"
            value={current.slug}
            onChange={(e) => setSlug(e.target.value)}
            className="min-w-0 flex-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400"
          >
            {viewable.map((d) => (
              <option key={d.slug} value={d.slug}>
                {d.label} — {d.name}
              </option>
            ))}
          </select>
        ) : (
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-900" title={current.name}>
            {current.label} <span className="font-normal text-zinc-500">— {current.name}</span>
          </p>
        )}
      </div>
      {/* Bounded height so the card itself stays sticky-able; the viewer scrolls inside it. */}
      <div className="flex h-[55vh] min-h-0 flex-col xl:h-[calc(100vh-7rem)]">
        <DocumentViewer key={current.slug} src={current.previewUrl as string} filename={current.name} fill />
      </div>
    </section>
  );
}

/**
 * Details left, sticky viewer right on wide screens; below the breakpoint the
 * viewer collapses to a card above the fields.
 */
export function SplitWithViewer({
  documents,
  children,
}: {
  documents: SubmitDocument[];
  children: React.ReactNode;
}) {
  const hasViewer = documents.some((d) => d.previewUrl);
  if (!hasViewer) return <>{children}</>;
  return (
    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
      <div className="min-w-0 xl:sticky xl:top-4 xl:order-2">
        <SubmitDocumentViewer documents={documents} />
      </div>
      <div className="min-w-0 xl:order-1">{children}</div>
    </div>
  );
}
