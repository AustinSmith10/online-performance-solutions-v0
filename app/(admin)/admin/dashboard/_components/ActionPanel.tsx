"use client";

import { useState, useCallback, useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Drawer } from "./Drawer";
import { AssignForm } from "@/app/(admin)/admin/projects/[id]/_components/AssignForm";
import { ResendTokenButton } from "@/app/(admin)/admin/projects/[id]/_components/ResendTokenButton";
import { UpdateEmailForm } from "@/app/(admin)/admin/projects/[id]/_components/UpdateEmailForm";
import { WaiveForm } from "@/app/(admin)/admin/projects/[id]/_components/WaiveForm";
import { DispatchButton } from "@/app/(admin)/admin/projects/[id]/_components/DispatchButton";
import { reconcileOverrideAction, type ReconcileState } from "@/app/actions/credits";
import { triggerPbdrConversion, type ConvertState } from "@/app/actions/conversion";
import { adminSetProjectNumberFromDashboard, type AdminProjectNumberState } from "@/app/actions/projects";
import type { ConsultantAvailability, ProjectStatus } from "@/types";

// ── Types (serialisable — passed from server component) ──────────────────────

export interface DashboardProject {
  id: string;
  project_number: string | null;
  po_number: string | null;
  site_address: string | null;
  status: ProjectStatus;
  expected_delivery_date: string | null;
  created_at: string;
  payment_override: boolean;
  payment_override_at: string | null;
  payment_override_reason: string | null;
  assigned_consultant_id: string | null;
  review_buffer_fired_at: string | null;
  qa_completed_by: string | null;
  organisations: { name: string } | null;
  consultant: { first_name: string | null; last_name: string | null; email: string; phone: string | null } | null;
}

export interface PendingReview {
  id: string;
  project_id: string;
  stakeholder_email: string;
  stakeholder_name: string;
  expires_at: string;
  fresh_token_sent_at: string | null;
}

export interface ConsultantOption {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  availability: ConsultantAvailability;
}

interface Props {
  unassigned: DashboardProject[];
  overdue: DashboardProject[];
  awaitingStakeholder: DashboardProject[];
  overridePending: DashboardProject[];
  pendingCountByProject: Record<string, number>;
  pendingReviews: PendingReview[];
  consultants: ConsultantOption[];
  todayIso: string;
  systemErrors: { id: string; message: string; project_id: string | null; created_at: string }[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  assigned: "Assigned",
  in_progress: "In Progress",
  dispatched: "Awaiting Approval",
  revision_required: "Revision Required",
  converting: "Converting to PBDR",
  delivered: "Delivered",
  complete: "Complete",
  paused: "Paused",
};

function projectLabel(p: { project_number: string | null; site_address: string | null; po_number: string | null; id: string }) {
  const addr = p.site_address;
  if (p.project_number && addr) return `${p.project_number} — ${addr}`;
  if (addr) return addr;
  return p.po_number ? `PO ${p.po_number}` : p.id.slice(0, 8);
}

function consultantName(c: { first_name: string | null; last_name: string | null; email: string } | null) {
  if (!c) return null;
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email;
}

const DATE_FMT: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric" };
const TIME_FMT: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
function fmtDate(s: string) { return new Date(s).toLocaleDateString("en-AU", DATE_FMT); }
function fmtTime(s: string) { return new Date(s).toLocaleTimeString("en-AU", TIME_FMT); }

// ── Inline form components ────────────────────────────────────────────────────

function OverrideReconcileForm({ projectId }: { projectId: string }) {
  const [state, formAction, pending] = useActionState<ReconcileState, FormData>(
    reconcileOverrideAction.bind(null, projectId),
    {}
  );

  if (state.success) {
    return (
      <p className="text-xs text-green-700">
        Override reconciled — payment marked as received externally.
      </p>
    );
  }

  return (
    <form action={formAction}>
      {state.error && <p className="mb-2 text-xs text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
      >
        {pending ? "Reconciling…" : "Mark payment received externally"}
      </button>
    </form>
  );
}

function RetryConversionForm({ projectId }: { projectId: string }) {
  const [state, formAction, pending] = useActionState<ConvertState, FormData>(
    triggerPbdrConversion.bind(null, projectId),
    {}
  );

  if (state.success) {
    return (
      <p className="text-xs text-green-700">
        Conversion re-triggered. Check the project for the updated status.
      </p>
    );
  }

  return (
    <form action={formAction}>
      {state.error && <p className="mb-2 text-xs text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs font-medium text-red-800 hover:bg-red-100 disabled:opacity-50"
      >
        {pending ? "Retrying…" : "Retry PBDR conversion"}
      </button>
    </form>
  );
}

// ── Drawer content components ─────────────────────────────────────────────────

function SetNumberAndAssignDrawerContent({
  project,
  consultants,
}: {
  project: DashboardProject;
  consultants: ConsultantOption[];
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [projectNumber, setProjectNumber] = useState("");
  const [state, action, pending] = useActionState<AdminProjectNumberState, FormData>(
    adminSetProjectNumberFromDashboard.bind(null, project.id),
    {}
  );

  useEffect(() => {
    if (!state.success) return;
    const t = setTimeout(() => setStep(2), 0);
    return () => clearTimeout(t);
  }, [state.success]);

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-4 py-3 text-sm">
        <p className="font-medium text-zinc-900">{projectLabel(project)}</p>
        <p className="mt-0.5 text-xs text-zinc-500">
          {project.organisations?.name ?? "—"} · Submitted {fmtDate(project.created_at)}
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
            step > 1 ? "bg-green-500 text-white" : "bg-zinc-900 text-white"
          }`}
        >
          {step > 1 ? (
            <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          ) : "1"}
        </span>
        <span className={`text-xs font-medium ${step === 1 ? "text-zinc-900" : "text-zinc-400"}`}>
          Set project number
        </span>
        <span className="text-zinc-300">→</span>
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
            step === 2 ? "bg-zinc-900 text-white" : "bg-zinc-200 text-zinc-500"
          }`}
        >
          2
        </span>
        <span className={`text-xs font-medium ${step === 2 ? "text-zinc-900" : "text-zinc-400"}`}>
          Assign consultant
        </span>
      </div>

      {step === 1 ? (
        <div>
          <p className="mb-3 text-xs text-zinc-500">
            Set the project number to generate the initial PBDB document.
          </p>
          <form action={action} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700">
                Project number
              </label>
              <input
                name="project_number"
                type="text"
                value={projectNumber}
                onChange={(e) => setProjectNumber(e.target.value)}
                placeholder="e.g. 25-001"
                required
                disabled={pending}
                className="block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-50"
              />
              <p className="mt-1 text-xs text-zinc-400">
                The suffix <span className="font-mono">-S</span> is appended automatically.
              </p>
            </div>
            {state.error && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{state.error}</p>
            )}
            <button
              type="submit"
              disabled={pending || !projectNumber.trim()}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
            >
              {pending ? "Generating…" : "Set & generate PBDB"}
            </button>
          </form>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
            <p className="text-sm font-medium text-green-900">Project number set</p>
            <p className="mt-0.5 text-xs text-green-700">
              PBDB is being generated — it will appear in the project files shortly.
            </p>
          </div>
          <div>
            <p className="mb-3 text-sm font-medium text-zinc-700">Assign a consultant</p>
            <AssignForm
              projectId={project.id}
              consultants={consultants}
              currentConsultantId=""
              isReassign={false}
            />
            {consultants.length === 0 && (
              <p className="mt-2 text-xs text-zinc-400">
                No consultants available — invite one from the users page.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AssignDrawerContent({
  project,
  consultants,
  onSuccess,
}: {
  project: DashboardProject;
  consultants: ConsultantOption[];
  onSuccess: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-4 py-3 text-sm">
        <p className="font-medium text-zinc-900">{projectLabel(project)}</p>
        <p className="mt-0.5 text-xs text-zinc-500">
          {project.organisations?.name ?? "—"} · Submitted{" "}
          {fmtDate(project.created_at)}
        </p>
      </div>

      <div>
        <p className="mb-3 text-sm font-medium text-zinc-700">Assign a consultant</p>
        <AssignForm
          projectId={project.id}
          consultants={consultants}
          currentConsultantId={project.assigned_consultant_id ?? ""}
          isReassign={false}
          onSuccess={onSuccess}
        />
      </div>
    </div>
  );
}

function OverdueDrawerContent({
  project,
  todayIso,
  pendingReviews,
  consultants,
  onSuccess,
}: {
  project: DashboardProject;
  todayIso: string;
  pendingReviews: PendingReview[];
  consultants: ConsultantOption[];
  onSuccess: () => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, "resend" | "email" | "waive" | null>>({});
  const [_sentIds, setSentIds] = useState<Set<string>>(new Set());

  function toggle(id: string, action: "resend" | "email" | "waive") {
    setExpanded((prev) => ({ ...prev, [id]: prev[id] === action ? null : action }));
  }

  function handleSent(id: string) {
    setSentIds((prev) => {
      const next = new Set(prev).add(id);
      if (next.size >= projectReviews.length) onSuccess();
      return next;
    });
  }

  const daysOverdue = project.expected_delivery_date
    ? Math.floor(
        (new Date(todayIso).getTime() - new Date(project.expected_delivery_date).getTime()) /
          (1000 * 60 * 60 * 24)
      )
    : 0;

  const projectReviews = pendingReviews.filter((r) => r.project_id === project.id);

  return (
    <div className="space-y-5">
      {/* Project summary */}
      <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-4 py-3">
        <p className="text-sm font-medium text-zinc-900">{projectLabel(project)}</p>
        <p className="mt-0.5 text-xs text-zinc-500">
          {project.organisations?.name ?? "—"} · {STATUS_LABELS[project.status]}
        </p>
      </div>

      {/* Overdue badge */}
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
        <p className="text-sm font-medium text-red-900">
          {daysOverdue} day{daysOverdue !== 1 ? "s" : ""} overdue
        </p>
        {project.expected_delivery_date && (
          <p className="mt-0.5 text-xs text-red-700">
            Was due {fmtDate(project.expected_delivery_date)}
          </p>
        )}
      </div>

      {/* Action: assign consultant (submitted, unassigned) */}
      {project.status === "submitted" && (
        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
            Assign a consultant
          </p>
          <AssignForm
            projectId={project.id}
            consultants={consultants}
            currentConsultantId={project.assigned_consultant_id ?? ""}
            isReassign={false}
            onSuccess={onSuccess}
          />
          {consultants.length === 0 && (
            <p className="text-xs text-zinc-400">
              No consultants available — invite one from the users page.
            </p>
          )}
        </div>
      )}

      {/* Action: dispatch failed — retry (in_progress with qa_completed_by set) */}
      {project.status === "in_progress" && !!project.qa_completed_by && (
        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
            Dispatch to stakeholders
          </p>
          <p className="text-xs text-zinc-500">
            QA was marked complete but dispatch did not succeed. Retry below.
          </p>
          <DispatchButton projectId={project.id} />
        </div>
      )}

      {/* Action: pending stakeholder responses (dispatched) */}
      {project.status === "dispatched" && projectReviews.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
            Pending responses ({projectReviews.length})
          </p>
          <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
            {projectReviews.map((r) => {
              const isExpired = r.expires_at && r.expires_at < new Date().toISOString();
              return (
                <li key={r.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-zinc-900">{r.stakeholder_name}</p>
                      <p className="truncate text-xs text-zinc-500">{r.stakeholder_email}</p>
                      {isExpired && (
                        <span className="mt-0.5 inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                          Link expired
                        </span>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-1">
                      <button
                        type="button"
                        onClick={() => toggle(r.id, "resend")}
                        className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                          expanded[r.id] === "resend"
                            ? "border-zinc-700 bg-zinc-800 text-white"
                            : "border-zinc-300 text-zinc-700 hover:bg-zinc-50"
                        }`}
                      >
                        Re-send
                      </button>
                      <button
                        type="button"
                        onClick={() => toggle(r.id, "email")}
                        className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                          expanded[r.id] === "email"
                            ? "border-zinc-700 bg-zinc-800 text-white"
                            : "border-zinc-300 text-zinc-700 hover:bg-zinc-50"
                        }`}
                      >
                        Update email
                      </button>
                      <button
                        type="button"
                        onClick={() => toggle(r.id, "waive")}
                        className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                          expanded[r.id] === "waive"
                            ? "border-red-600 bg-red-600 text-white"
                            : "border-red-200 text-red-600 hover:bg-red-50"
                        }`}
                      >
                        Waive
                      </button>
                    </div>
                  </div>
                  {expanded[r.id] === "resend" && (
                    <div className="mt-3">
                      <ResendTokenButton reviewId={r.id} projectId={project.id} onSent={() => handleSent(r.id)} />
                    </div>
                  )}
                  {expanded[r.id] === "email" && (
                    <div className="mt-3">
                      <UpdateEmailForm
                        reviewId={r.id}
                        projectId={project.id}
                        currentEmail={r.stakeholder_email}
                      />
                    </div>
                  )}
                  {expanded[r.id] === "waive" && (
                    <div className="mt-3">
                      <WaiveForm
                        reviewId={r.id}
                        projectId={project.id}
                        stakeholderName={r.stakeholder_name}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Dispatched — all acknowledged, ready to convert */}
      {project.status === "dispatched" && projectReviews.length === 0 && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
          <p className="text-sm font-medium text-green-900">All stakeholders have responded</p>
          <p className="mt-0.5 text-xs text-green-700">
            Open the full project to trigger PBDR conversion.
          </p>
        </div>
      )}

      {/* Fallback: in_progress / assigned / revision_required — show consultant info */}
      {!["submitted", "dispatched"].includes(project.status) && (
        project.assigned_consultant_id ? (
          <div className="rounded-lg border border-zinc-200 px-4 py-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
              Assigned consultant
            </p>
            <p className="text-sm font-medium text-zinc-900">{consultantName(project.consultant)}</p>
            <p className="mt-0.5 text-xs text-zinc-600">{project.consultant?.email}</p>
            {project.consultant?.phone && (
              <p className="mt-0.5 text-xs text-zinc-600">{project.consultant.phone}</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">No consultant assigned.</p>
        )
      )}
    </div>
  );
}

function StakeholderDrawerContent({
  project,
  reviews,
  onSuccess,
}: {
  project: DashboardProject;
  reviews: PendingReview[];
  onSuccess: () => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, "resend" | "email" | "waive" | null>>({});
  const [_sentIds, setSentIds] = useState<Set<string>>(new Set());

  function toggle(id: string, action: "resend" | "email" | "waive") {
    setExpanded((prev) => ({ ...prev, [id]: prev[id] === action ? null : action }));
  }

  function handleSent(id: string) {
    setSentIds((prev) => {
      const next = new Set(prev).add(id);
      if (next.size >= reviews.length) onSuccess();
      return next;
    });
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-4 py-3">
        <p className="text-sm font-medium text-zinc-900">{projectLabel(project)}</p>
        <p className="mt-0.5 text-xs text-zinc-500">
          {project.organisations?.name ?? "—"}
          {project.review_buffer_fired_at && (
            <> · Buffer fired {fmtDate(project.review_buffer_fired_at)}</>
          )}
        </p>
      </div>

      <p className="text-sm font-medium text-zinc-700">
        Pending reviews ({reviews.length})
      </p>

      <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
        {reviews.map((r) => {
          const isExpired = r.expires_at && r.expires_at < new Date().toISOString();
          return (
            <li key={r.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-900">{r.stakeholder_name}</p>
                  <p className="truncate text-xs text-zinc-500">{r.stakeholder_email}</p>
                  {isExpired && (
                    <span className="mt-0.5 inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                      Link expired
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => toggle(r.id, "resend")}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                      expanded[r.id] === "resend"
                        ? "border-zinc-700 bg-zinc-800 text-white"
                        : "border-zinc-300 text-zinc-700 hover:bg-zinc-50"
                    }`}
                  >
                    Re-send
                  </button>
                  <button
                    type="button"
                    onClick={() => toggle(r.id, "email")}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                      expanded[r.id] === "email"
                        ? "border-zinc-700 bg-zinc-800 text-white"
                        : "border-zinc-300 text-zinc-700 hover:bg-zinc-50"
                    }`}
                  >
                    Update email
                  </button>
                  <button
                    type="button"
                    onClick={() => toggle(r.id, "waive")}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                      expanded[r.id] === "waive"
                        ? "border-red-600 bg-red-600 text-white"
                        : "border-red-200 text-red-600 hover:bg-red-50"
                    }`}
                  >
                    Waive
                  </button>
                </div>
              </div>

              {expanded[r.id] === "resend" && (
                <ResendTokenButton reviewId={r.id} projectId={project.id} onSent={() => handleSent(r.id)} />
              )}
              {expanded[r.id] === "email" && (
                <UpdateEmailForm
                  reviewId={r.id}
                  projectId={project.id}
                  currentEmail={r.stakeholder_email}
                />
              )}
              {expanded[r.id] === "waive" && (
                <WaiveForm
                  reviewId={r.id}
                  projectId={project.id}
                  stakeholderName={r.stakeholder_name}
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function OverrideDrawerContent({ project }: { project: DashboardProject }) {
  const [now] = useState(() => Date.now());
  const daysAgo = project.payment_override_at
    ? Math.floor((now - new Date(project.payment_override_at).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-4 py-3">
        <p className="text-sm font-medium text-zinc-900">{projectLabel(project)}</p>
        <p className="mt-0.5 text-xs text-zinc-500">
          {project.organisations?.name ?? "—"} · {STATUS_LABELS[project.status]}
        </p>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
        <p className="text-sm font-medium text-amber-900">Payment override active</p>
        {project.payment_override_at && (
          <p className="mt-0.5 text-xs text-amber-700">
            Applied {fmtDate(project.payment_override_at)}
            {daysAgo !== null && ` (${daysAgo} day${daysAgo !== 1 ? "s" : ""} ago)`}
          </p>
        )}
        {project.payment_override_reason && (
          <div className="mt-2 border-t border-amber-200 pt-2">
            <p className="text-xs font-medium text-amber-800">Reason</p>
            <p className="mt-0.5 text-xs text-amber-700">{project.payment_override_reason}</p>
          </div>
        )}
      </div>

      <div>
        <p className="mb-1 text-sm font-medium text-zinc-700">Reconcile override</p>
        <p className="mb-3 text-xs text-zinc-500">
          Use this when payment has been received externally or the override can be cleared.
        </p>
        <OverrideReconcileForm projectId={project.id} />
      </div>
    </div>
  );
}

function ErrorDrawerContent({
  error,
}: {
  error: { id: string; message: string; project_id: string | null; created_at: string };
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-red-500">Error details</p>
        <p className="mt-1 break-words text-sm text-red-900">{error.message}</p>
        <p className="mt-2 text-xs text-red-400">
          {fmtDate(error.created_at)} {fmtTime(error.created_at)}
        </p>
      </div>

      {error.project_id ? (
        <div>
          <p className="mb-1 text-sm font-medium text-zinc-700">Retry conversion</p>
          <p className="mb-3 text-xs text-zinc-500">
            Re-triggers the PBDR PDF generation pipeline for this project.
          </p>
          <RetryConversionForm projectId={error.project_id} />
        </div>
      ) : (
        <p className="text-xs text-zinc-400">No project linked — no retry available.</p>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type SystemError = { id: string; message: string; project_id: string | null; created_at: string };

type DrawerState =
  | { type: "assign"; project: DashboardProject }
  | { type: "set-number"; project: DashboardProject }
  | { type: "stakeholder"; project: DashboardProject }
  | { type: "override"; project: DashboardProject }
  | { type: "overdue"; project: DashboardProject }
  | { type: "error"; error: SystemError }
  | null;

export function ActionPanel({
  unassigned,
  overdue,
  awaitingStakeholder,
  overridePending,
  pendingCountByProject,
  pendingReviews,
  consultants,
  todayIso,
  systemErrors,
}: Props) {
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [drawerSuccess, setDrawerSuccess] = useState<string | null>(null);
  const router = useRouter();

  const closeDrawer = useCallback(() => {
    setDrawer(null);
    setDrawerSuccess(null);
    router.refresh();
  }, [router]);

  const handleSuccess = useCallback((message: string) => {
    setDrawerSuccess(message);
  }, []);

  const actionCount =
    unassigned.length +
    overdue.length +
    awaitingStakeholder.length +
    overridePending.length +
    systemErrors.length;

  const activeReviews =
    drawer?.type === "stakeholder"
      ? pendingReviews.filter((r) => r.project_id === drawer.project.id)
      : [];

  const drawerTitle =
    drawer?.type === "error"
      ? "System Error"
      : drawer
      ? projectLabel(drawer.project)
      : "";

  const drawerSubtitle =
    drawer?.type === "error"
      ? undefined
      : drawer?.project.organisations?.name ?? undefined;

  const drawerProjectId =
    drawer?.type === "error"
      ? drawer.error.project_id ?? ""
      : drawer?.project.id ?? "";

  const drawerAnchorId =
    drawer?.type === "assign" || drawer?.type === "set-number"
      ? "assign"
      : drawer?.type === "stakeholder"
      ? "stakeholders"
      : undefined;

  return (
    <>
      {actionCount > 0 && (
        <section className="space-y-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
            Action required
          </h2>

          {/* Overdue */}
          {overdue.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-white">
              <div className="flex items-center gap-2 border-b border-red-100 bg-red-50 px-5 py-3">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs font-semibold text-white">
                  {overdue.length}
                </span>
                <span className="text-sm font-medium text-red-900">
                  Overdue project{overdue.length !== 1 ? "s" : ""} — past expected delivery date
                </span>
              </div>
              <ul className="divide-y divide-zinc-100">
                {overdue.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-zinc-50">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-zinc-900">{projectLabel(p)}</p>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {p.organisations?.name ?? "—"}
                        {" · "}
                        {consultantName(p.consultant) ?? <span className="text-zinc-400">Unassigned</span>}
                        {" · "}
                        <span className="font-medium text-red-600">
                          Due {fmtDate(p.expected_delivery_date!)}
                        </span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDrawer({ type: "overdue", project: p })}
                      className="shrink-0 rounded border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
                    >
                      View →
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Unassigned submissions */}
          {unassigned.length > 0 && (
            <div className="rounded-lg border border-blue-200 bg-white">
              <div className="flex items-center gap-2 border-b border-blue-100 bg-blue-50 px-5 py-3">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">
                  {unassigned.length}
                </span>
                <span className="text-sm font-medium text-blue-900">
                  New submission{unassigned.length !== 1 ? "s" : ""} pending setup
                </span>
              </div>
              <ul className="divide-y divide-zinc-100">
                {unassigned.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-zinc-50">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-zinc-900">{projectLabel(p)}</p>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {p.organisations?.name ?? "—"}
                        {" · "}
                        Submitted {fmtDate(p.created_at)}
                        {!p.project_number && (
                          <> · <span className="font-medium text-amber-600">No project number</span></>
                        )}
                      </p>
                    </div>
                    {!p.project_number ? (
                      <button
                        type="button"
                        onClick={() => setDrawer({ type: "set-number", project: p })}
                        className="shrink-0 rounded border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100"
                      >
                        Set number →
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDrawer({ type: "assign", project: p })}
                        className="shrink-0 rounded border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
                      >
                        Assign →
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Awaiting stakeholder response */}
          {awaitingStakeholder.length > 0 && (
            <div className="rounded-lg border border-orange-200 bg-white">
              <div className="flex items-center gap-2 border-b border-orange-100 bg-orange-50 px-5 py-3">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-600 text-xs font-semibold text-white">
                  {awaitingStakeholder.length}
                </span>
                <span className="text-sm font-medium text-orange-900">
                  Awaiting stakeholder response — action required
                </span>
              </div>
              <ul className="divide-y divide-zinc-100">
                {awaitingStakeholder.map((p) => {
                  const pendingCount = pendingCountByProject[p.id] ?? 0;
                  const bufferDate = p.review_buffer_fired_at
                    ? fmtDate(p.review_buffer_fired_at)
                    : null;
                  return (
                    <li key={p.id} className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-zinc-50">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-zinc-900">{projectLabel(p)}</p>
                        <p className="mt-0.5 text-xs text-zinc-500">
                          {p.organisations?.name ?? "—"}
                          {" · "}
                          <span className="font-medium text-orange-600">
                            {pendingCount} stakeholder{pendingCount !== 1 ? "s" : ""} pending
                          </span>
                          {bufferDate && <> · Buffer fired {bufferDate}</>}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setDrawer({ type: "stakeholder", project: p })}
                        className="shrink-0 rounded border border-orange-300 bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-700 hover:bg-orange-100"
                      >
                        Manage →
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Override — Payment Pending */}
          {overridePending.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-white">
              <div className="flex items-center gap-2 border-b border-amber-100 bg-amber-50 px-5 py-3">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-600 text-xs font-semibold text-white">
                  {overridePending.length}
                </span>
                <span className="text-sm font-medium text-amber-900">
                  Override — Payment Pending
                </span>
              </div>
              <ul className="divide-y divide-zinc-100">
                {overridePending.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-zinc-50">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-zinc-900">{projectLabel(p)}</p>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {p.organisations?.name ?? "—"}
                        {" · "}
                        {STATUS_LABELS[p.status] ?? p.status}
                        {p.payment_override_at && (
                          <> · Override applied {fmtDate(p.payment_override_at!)}</>
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDrawer({ type: "override", project: p })}
                      className="shrink-0 rounded border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100"
                    >
                      Review →
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* System errors */}
          {systemErrors.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-white">
              <div className="flex items-center gap-2 border-b border-red-100 bg-red-50 px-5 py-3">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs font-semibold text-white">
                  {systemErrors.length}
                </span>
                <span className="text-sm font-medium text-red-900">System errors</span>
              </div>
              <ul className="divide-y divide-zinc-50">
                {systemErrors.map((n) => (
                  <li key={n.id} className="flex items-center justify-between gap-4 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-zinc-800">{n.message}</p>
                      {n.project_id && (
                        <p className="mt-0.5 text-xs text-zinc-400">
                          Project {n.project_id.slice(0, 8)}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setDrawer({ type: "error", error: n })}
                      className="shrink-0 rounded border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
                    >
                      Details →
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* ── Modal ── */}
      <Drawer
        isOpen={drawer !== null}
        onClose={closeDrawer}
        title={drawerTitle}
        subtitle={drawerSubtitle}
        projectId={drawerProjectId}
        anchorId={drawerAnchorId}
        successMessage={drawerSuccess ?? undefined}
      >
        {drawer?.type === "set-number" && (
          <SetNumberAndAssignDrawerContent
            project={drawer.project}
            consultants={consultants}
          />
        )}
        {drawer?.type === "assign" && (
          <AssignDrawerContent
            project={drawer.project}
            consultants={consultants}
            onSuccess={() => handleSuccess("Consultant assigned successfully.")}
          />
        )}
        {drawer?.type === "overdue" && (
          <OverdueDrawerContent
            project={drawer.project}
            todayIso={todayIso}
            pendingReviews={pendingReviews}
            consultants={consultants}
            onSuccess={() => handleSuccess("Action completed successfully.")}
          />
        )}
        {drawer?.type === "stakeholder" && (
          <StakeholderDrawerContent
            project={drawer.project}
            reviews={activeReviews}
            onSuccess={() => handleSuccess(
              activeReviews.length > 1
                ? "All review links have been resent."
                : "Review link resent successfully."
            )}
          />
        )}
        {drawer?.type === "override" && (
          <OverrideDrawerContent project={drawer.project} />
        )}
        {drawer?.type === "error" && (
          <ErrorDrawerContent error={drawer.error} />
        )}
      </Drawer>
    </>
  );
}
