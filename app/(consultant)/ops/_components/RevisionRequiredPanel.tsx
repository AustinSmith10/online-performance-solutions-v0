"use client";

import { useState, useCallback } from "react";
import { Drawer } from "./Drawer";
import { PbdbQaUploadForm } from "@/app/(consultant)/ops/projects/[id]/_components/PbdbQaUploadForm";
import { DownloadCard } from "@/components/DownloadCard";

export interface RevisionProject {
  id: string;
  project_number: string | null;
  extracted_fields: Record<string, string> | null;
  po_number: string | null;
  review_cycle: number;
  created_at: string;
  clients: { name: string } | null;
}

export interface PbdbFile {
  id: string;
  original_filename: string | null;
  version: number;
}

export interface ReviewRow {
  id: string;
  project_id: string;
  stakeholder_name: string;
  stakeholder_email: string;
  status: string;
  comments: string | null;
  responded_at: string | null;
  review_cycle: number;
}

function projectLabel(p: Pick<RevisionProject, "project_number" | "extracted_fields" | "po_number" | "id">) {
  const addr = (p.extracted_fields?.["EXTRACT_ADDRESS"] as string | undefined) ?? null;
  if (p.project_number && addr) return `${p.project_number} — ${addr}`;
  return addr ?? (p.po_number ? `PO ${p.po_number}` : p.id.slice(0, 8));
}

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "bg-amber-100 text-amber-700" },
  approved_without_comments: { label: "Approved", cls: "bg-green-100 text-green-700" },
  approved_with_comments: { label: "Approved with notes", cls: "bg-green-100 text-green-700" },
  rejected_with_comments: { label: "Rejected", cls: "bg-red-100 text-red-700" },
  waived: { label: "Waived", cls: "bg-zinc-100 text-zinc-500" },
};

function DrawerContent({
  project,
  reviews,
  pbdbFile,
}: {
  project: RevisionProject;
  reviews: ReviewRow[];
  pbdbFile: PbdbFile | null;
}) {
  const currentReviews = reviews.filter((r) => r.review_cycle === project.review_cycle);
  const rejections = currentReviews.filter((r) => r.status === "rejected_with_comments");

  return (
    <div className="space-y-5">
      {/* Project summary */}
      <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-4 py-3">
        <p className="text-sm font-medium text-zinc-900">{projectLabel(project)}</p>
        <p className="mt-0.5 text-xs text-zinc-500">
          {project.clients?.name ?? "—"}
          {" · "}
          <span className="font-medium text-red-600">Revision required — cycle {project.review_cycle}</span>
        </p>
      </div>

      {/* Stakeholder feedback */}
      {currentReviews.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
            Stakeholder feedback — cycle {project.review_cycle}
          </p>
          <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
            {currentReviews.map((r) => {
              const cfg = STATUS_CONFIG[r.status] ?? { label: r.status, cls: "bg-zinc-100 text-zinc-500" };
              return (
                <li key={r.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-900">{r.stakeholder_name}</p>
                      <p className="text-xs text-zinc-500">{r.stakeholder_email}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cfg.cls}`}>
                        {cfg.label}
                      </span>
                      {r.responded_at && (
                        <p className="mt-0.5 text-xs text-zinc-400">
                          {new Date(r.responded_at).toLocaleDateString("en-AU", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </p>
                      )}
                    </div>
                  </div>
                  {r.comments && (
                    <p className="mt-2 text-sm leading-relaxed text-zinc-700">{r.comments}</p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* PBDB sent to stakeholders — download to make edits against */}
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
          PBDB sent to stakeholders
        </p>
        {pbdbFile ? (
          <DownloadCard
            href={`/api/download/pbdb/${pbdbFile.id}`}
            filename={pbdbFile.original_filename ?? undefined}
            originalFilename={pbdbFile.original_filename}
            external
            buttonLabel="Download ↓"
            buttonClassName="ml-3 shrink-0 text-xs font-medium text-zinc-500 hover:text-zinc-700"
            wrapperClassName="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-3 hover:bg-zinc-50"
          >
            <p className="truncate text-sm font-medium text-zinc-900">PBDB document</p>
            <p className="text-xs text-zinc-500">Version {pbdbFile.version}</p>
          </DownloadCard>
        ) : (
          <p className="text-xs text-zinc-400">No PBDB file found for this project.</p>
        )}
      </div>

      {/* Upload revised PBDB */}
      <div>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-400">
          Upload revised PBDB
        </p>
        <p className="mb-3 text-xs text-zinc-500">
          Correct the document in Word, then upload the revised version to re-submit to
          stakeholders.
        </p>
        {rejections.length === 0 && currentReviews.length === 0 && (
          <p className="mb-3 text-xs text-zinc-400">No stakeholder responses recorded yet.</p>
        )}
        <PbdbQaUploadForm
          projectId={project.id}
          submitLabel="Upload revised PBDB and re-submit to stakeholders"
        />
      </div>
    </div>
  );
}

export function RevisionRequiredPanel({
  projects,
  reviewsByProject,
  pbdbFileByProject,
}: {
  projects: RevisionProject[];
  reviewsByProject: Record<string, ReviewRow[]>;
  pbdbFileByProject: Record<string, PbdbFile>;
}) {
  const [active, setActive] = useState<RevisionProject | null>(null);
  const close = useCallback(() => setActive(null), []);

  if (projects.length === 0) return null;

  return (
    <>
      <div className="rounded-lg border border-red-200 bg-white">
        <div className="flex items-center gap-2 border-b border-red-100 bg-red-50 px-5 py-3">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs font-semibold text-white">
            {projects.length}
          </span>
          <span className="text-sm font-medium text-red-900">
            Revision required — stakeholder{projects.length !== 1 ? "s have" : " has"} rejected the
            PBDB
          </span>
        </div>
        <ul className="divide-y divide-zinc-100">
          {projects.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-zinc-50"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-zinc-900">{projectLabel(p)}</p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {p.clients?.name ?? "—"}
                  {" · "}
                  <span className="font-medium text-red-600">Cycle {p.review_cycle}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActive(p)}
                className="shrink-0 rounded border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
              >
                View →
              </button>
            </li>
          ))}
        </ul>
      </div>

      <Drawer
        isOpen={active !== null}
        onClose={close}
        title={active ? projectLabel(active) : ""}
        subtitle={active?.clients?.name}
        projectId={active?.id ?? ""}
      >
        {active && (
          <DrawerContent
            project={active}
            reviews={reviewsByProject[active.id] ?? []}
            pbdbFile={pbdbFileByProject[active.id] ?? null}
          />
        )}
      </Drawer>
    </>
  );
}
