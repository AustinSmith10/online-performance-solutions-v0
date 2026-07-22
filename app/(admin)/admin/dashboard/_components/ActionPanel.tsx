"use client";

import { useState, useCallback, useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Drawer } from "@/components/Drawer";
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
  clients: { name: string } | null;
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

export interface EmailFailure {
  id: string;
  to_email: string;
  subject: string;
  source: string;
  project_id: string | null;
  created_at: string;
  error: string | null;
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
  emailFailures: EmailFailure[];
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
      <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3 text-sm">
        <p className="font-medium text-zinc-900">{projectLabel(project)}</p>
        <p className="mt-0.5 text-xs text-zinc-500">
          {project.clients?.name ?? "—"} · Submitted {fmtDate(project.created_at)}
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
            Set the project number to unlock PBDB generation.
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
              {pending ? "Saving…" : "Save"}
            </button>
          </form>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3">
            <p className="text-sm font-medium text-green-900">Project number set</p>
            <p className="mt-0.5 text-xs text-green-700">
              Generate the PBDB from the project&apos;s PBDB step once a consultant is assigned.
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
      <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3 text-sm">
        <p className="font-medium text-zinc-900">{projectLabel(project)}</p>
        <p className="mt-0.5 text-xs text-zinc-500">
          {project.clients?.name ?? "—"} · Submitted{" "}
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
      <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3">
        <p className="text-sm font-medium text-zinc-900">{projectLabel(project)}</p>
        <p className="mt-0.5 text-xs text-zinc-500">
          {project.clients?.name ?? "—"} · {STATUS_LABELS[project.status]}
        </p>
      </div>

      {/* Overdue badge */}
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
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
          <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200">
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
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3">
          <p className="text-sm font-medium text-green-900">All stakeholders have responded</p>
          <p className="mt-0.5 text-xs text-green-700">
            Open the full project to trigger PBDR conversion.
          </p>
        </div>
      )}

      {/* Fallback: in_progress / assigned / revision_required — show consultant info */}
      {!["submitted", "dispatched"].includes(project.status) && (
        project.assigned_consultant_id ? (
          <div className="rounded-xl border border-zinc-200 px-4 py-3">
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
      <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3">
        <p className="text-sm font-medium text-zinc-900">{projectLabel(project)}</p>
        <p className="mt-0.5 text-xs text-zinc-500">
          {project.clients?.name ?? "—"}
          {project.review_buffer_fired_at && (
            <> · Buffer fired {fmtDate(project.review_buffer_fired_at)}</>
          )}
        </p>
      </div>

      <p className="text-sm font-medium text-zinc-700">
        Pending reviews ({reviews.length})
      </p>

      <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200">
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
      <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3">
        <p className="text-sm font-medium text-zinc-900">{projectLabel(project)}</p>
        <p className="mt-0.5 text-xs text-zinc-500">
          {project.clients?.name ?? "—"} · {STATUS_LABELS[project.status]}
        </p>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
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
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
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

function EmailFailureDrawerContent({ failure }: { failure: EmailFailure }) {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-red-500">Delivery failed</p>
        <p className="mt-1 break-words text-sm text-red-900">To: {failure.to_email}</p>
        <p className="mt-1 break-words text-sm text-zinc-700">{failure.subject}</p>
        <p className="mt-1 text-xs text-zinc-400">Source: {failure.source}</p>
        {failure.error && (
          <p className="mt-2 break-words rounded bg-red-100 px-2 py-1.5 font-mono text-xs text-red-700">
            {failure.error}
          </p>
        )}
        <p className="mt-2 text-xs text-red-400">
          {fmtDate(failure.created_at)} {fmtTime(failure.created_at)}
        </p>
      </div>
      <p className="text-xs text-zinc-500">
        Check the Postmark Activity log for this recipient to confirm whether the send was rejected,
        bounced, or never reached Postmark at all.
      </p>
    </div>
  );
}

// ── Hero cards ───────────────────────────────────────────────────────────────
//
// Generalises the client/consultant "Right now" CompactHero pattern to N
// categories with N projects each: an icon + the state name (not a repeated
// "Right now") in the header, one action button when a category has a
// single item, or a "Review (N)" toggle that expands a compact list of
// one-line rows *inside the same card* when it has more than one — never
// act on the first, ignore the rest.

type Tone = "red" | "blue" | "orange" | "amber";
type HeroIconKey = "clock" | "inbox" | "people" | "card" | "alert";
type HeroItem = { id: string; label: string; meta: string; actionLabel: string; open: () => DrawerState };
type HeroCategory = { key: string; tone: Tone; label: string; icon: HeroIconKey; subtitle: string; items: HeroItem[] };

const HERO_TONE: Record<Tone, { box: string; title: string; button: string; iconBg: string }> = {
  red: { box: "border-red-200 bg-red-50", title: "text-red-900", button: "border-red-300 bg-white text-red-700 hover:bg-red-100", iconBg: "bg-red-500" },
  blue: { box: "border-blue-200 bg-blue-50", title: "text-blue-900", button: "border-blue-300 bg-white text-blue-700 hover:bg-blue-100", iconBg: "bg-blue-500" },
  orange: { box: "border-orange-200 bg-orange-50", title: "text-orange-900", button: "border-orange-300 bg-white text-orange-700 hover:bg-orange-100", iconBg: "bg-orange-500" },
  amber: { box: "border-amber-200 bg-amber-50", title: "text-amber-900", button: "border-amber-300 bg-white text-amber-700 hover:bg-amber-100", iconBg: "bg-amber-500" },
};

function HeroIconGlyph({ icon, className }: { icon: HeroIconKey; className?: string }) {
  switch (icon) {
    case "clock":
      return (
        <svg className={className} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-11.25a.75.75 0 00-1.5 0V10c0 .199.079.39.22.53l2.5 2.5a.75.75 0 101.06-1.06l-2.28-2.28V6.75z" clipRule="evenodd" />
        </svg>
      );
    case "inbox":
      return (
        <svg className={className} viewBox="0 0 20 20" fill="currentColor">
          <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2h-3.5a.5.5 0 00-.4.2l-.9 1.2a.5.5 0 01-.4.2h-2.6a.5.5 0 01-.4-.2l-.9-1.2A.5.5 0 006.5 6H3V4z" />
          <path fillRule="evenodd" d="M3 8h3.75l.9 1.2a1.5 1.5 0 001.2.6h2.3a1.5 1.5 0 001.2-.6l.9-1.2H17v6a1 1 0 01-1 1H4a1 1 0 01-1-1V8z" clipRule="evenodd" />
        </svg>
      );
    case "people":
      return (
        <svg className={className} viewBox="0 0 20 20" fill="currentColor">
          <path d="M7 8a3 3 0 100-6 3 3 0 000 6zM14.5 9a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM1.615 16.428a1.224 1.224 0 01-.569-1.175 6.002 6.002 0 0111.908 0c.058.467-.172.92-.57 1.174A9.953 9.953 0 017 18a9.953 9.953 0 01-5.385-1.572zM14.5 16h-.106c.106-.31.18-.632.217-.964a4.978 4.978 0 00-1.056-3.79 6.487 6.487 0 013.63 1.55.998.998 0 01.35.98A5.006 5.006 0 0114.5 16z" />
        </svg>
      );
    case "card":
      return (
        <svg className={className} viewBox="0 0 20 20" fill="currentColor">
          <path d="M2 5.5A1.5 1.5 0 013.5 4h13A1.5 1.5 0 0118 5.5v.5H2v-.5z" />
          <path fillRule="evenodd" d="M2 8h16v6.5a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 012 14.5V8zm2 4.25a.75.75 0 01.75-.75h3.5a.75.75 0 010 1.5h-3.5a.75.75 0 01-.75-.75z" clipRule="evenodd" />
        </svg>
      );
    case "alert":
      return (
        <svg className={className} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
        </svg>
      );
  }
}

function HeroCard({
  category,
  expanded,
  onToggleExpand,
  onOpen,
}: {
  category: HeroCategory;
  expanded: boolean;
  onToggleExpand: () => void;
  onOpen: (drawer: DrawerState) => void;
}) {
  const t = HERO_TONE[category.tone];
  const single = category.items.length === 1 ? category.items[0] : null;

  return (
    <div className={`rounded-lg border px-4 py-2.5 ${t.box}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex min-w-0 shrink-0 items-center gap-1.5">
            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white ${t.iconBg}`}>
              <HeroIconGlyph icon={category.icon} className="h-3 w-3" />
            </span>
            <span className={`whitespace-nowrap text-sm font-semibold ${t.title}`}>{category.label}</span>
          </span>
          <span className="truncate text-xs text-zinc-500">{category.subtitle}</span>
        </div>
        <div className="shrink-0">
          {single ? (
            <button type="button" onClick={() => onOpen(single.open())} className={`rounded-md border px-3 py-1.5 text-xs font-medium ${t.button}`}>
              {single.actionLabel}
            </button>
          ) : (
            <button type="button" onClick={onToggleExpand} className={`rounded-md border px-3 py-1.5 text-xs font-medium ${t.button}`}>
              Review ({category.items.length}) {expanded ? "▲" : "▼"}
            </button>
          )}
        </div>
      </div>
      {!single && expanded && (
        <div className="mt-2.5 space-y-1 border-t border-zinc-900/10 pt-2.5">
          {category.items.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 rounded-md bg-white/70 px-2.5 py-1.5">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-zinc-900">{item.label}</p>
                <p className="truncate text-[11px] text-zinc-500">{item.meta}</p>
              </div>
              <button type="button" onClick={() => onOpen(item.open())} className="shrink-0 text-xs font-medium text-zinc-700 underline decoration-dotted underline-offset-2 hover:text-zinc-900">
                {item.actionLabel}
              </button>
            </div>
          ))}
        </div>
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
  | { type: "email-failure"; failure: EmailFailure }
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
  emailFailures,
}: Props) {
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [drawerSuccess, setDrawerSuccess] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
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
    systemErrors.length +
    emailFailures.length;

  const activeReviews =
    drawer?.type === "stakeholder"
      ? pendingReviews.filter((r) => r.project_id === drawer.project.id)
      : [];

  const drawerTitle =
    drawer?.type === "error"
      ? "System Error"
      : drawer?.type === "email-failure"
      ? "Email Delivery Failed"
      : drawer
      ? projectLabel(drawer.project)
      : "";

  const drawerSubtitle =
    drawer?.type === "error" || drawer?.type === "email-failure"
      ? undefined
      : drawer?.project.clients?.name ?? undefined;

  const drawerProjectId =
    drawer?.type === "error"
      ? drawer.error.project_id ?? ""
      : drawer?.type === "email-failure"
      ? drawer.failure.project_id ?? ""
      : drawer?.project.id ?? "";

  const drawerAnchorId =
    drawer?.type === "assign" || drawer?.type === "set-number"
      ? "assign"
      : drawer?.type === "stakeholder"
      ? "stakeholders"
      : undefined;

  const heroCategories: HeroCategory[] = [
    ...(overdue.length > 0
      ? [
          {
            key: "overdue",
            tone: "red" as const,
            label: "Overdue",
            icon: "clock" as const,
            subtitle: `${overdue.length} project${overdue.length !== 1 ? "s" : ""} past their expected delivery date`,
            items: overdue.map((p) => ({
              id: p.id,
              label: projectLabel(p),
              meta: `${p.clients?.name ?? "—"} · ${consultantName(p.consultant) ?? "Unassigned"} · Due ${fmtDate(p.expected_delivery_date!)}`,
              actionLabel: "View →",
              open: () => ({ type: "overdue" as const, project: p }),
            })),
          },
        ]
      : []),
    ...(unassigned.length > 0
      ? [
          {
            key: "unassigned",
            tone: "blue" as const,
            label: "New Submission",
            icon: "inbox" as const,
            subtitle: `${unassigned.length} new submission${unassigned.length !== 1 ? "s" : ""} pending setup`,
            items: unassigned.map((p) => ({
              id: p.id,
              label: projectLabel(p),
              meta: `${p.clients?.name ?? "—"} · Submitted ${fmtDate(p.created_at)}${!p.project_number ? " · No project number" : ""}`,
              actionLabel: p.project_number ? "Assign →" : "Set number →",
              open: () => (p.project_number ? { type: "assign" as const, project: p } : { type: "set-number" as const, project: p }),
            })),
          },
        ]
      : []),
    ...(awaitingStakeholder.length > 0
      ? [
          {
            key: "awaiting",
            tone: "orange" as const,
            label: "Awaiting Stakeholder",
            icon: "people" as const,
            subtitle: `${awaitingStakeholder.length} project${awaitingStakeholder.length !== 1 ? "s" : ""} awaiting stakeholder response`,
            items: awaitingStakeholder.map((p) => {
              const pendingCount = pendingCountByProject[p.id] ?? 0;
              const bufferDate = p.review_buffer_fired_at ? fmtDate(p.review_buffer_fired_at) : null;
              return {
                id: p.id,
                label: projectLabel(p),
                meta: `${p.clients?.name ?? "—"} · ${pendingCount} pending${bufferDate ? ` · Buffer fired ${bufferDate}` : ""}`,
                actionLabel: "Manage →",
                open: () => ({ type: "stakeholder" as const, project: p }),
              };
            }),
          },
        ]
      : []),
    ...(overridePending.length > 0
      ? [
          {
            key: "override",
            tone: "amber" as const,
            label: "Payment Pending",
            icon: "card" as const,
            subtitle: `${overridePending.length} payment override${overridePending.length !== 1 ? "s" : ""} pending`,
            items: overridePending.map((p) => ({
              id: p.id,
              label: projectLabel(p),
              meta: `${p.clients?.name ?? "—"} · ${STATUS_LABELS[p.status] ?? p.status}${p.payment_override_at ? ` · Override applied ${fmtDate(p.payment_override_at)}` : ""}`,
              actionLabel: "Review →",
              open: () => ({ type: "override" as const, project: p }),
            })),
          },
        ]
      : []),
    ...(systemErrors.length > 0
      ? [
          {
            key: "error",
            tone: "red" as const,
            label: "Sys Error",
            icon: "alert" as const,
            subtitle: `${systemErrors.length} system error${systemErrors.length !== 1 ? "s" : ""} need attention`,
            items: systemErrors.map((n) => ({
              id: n.id,
              label: n.message,
              meta: n.project_id ? `Project ${n.project_id.slice(0, 8)} · ${fmtDate(n.created_at)}` : fmtDate(n.created_at),
              actionLabel: "Details →",
              open: () => ({ type: "error" as const, error: n }),
            })),
          },
        ]
      : []),
    ...(emailFailures.length > 0
      ? [
          {
            key: "email-failure",
            tone: "red" as const,
            label: "Email Failed",
            icon: "alert" as const,
            subtitle: `${emailFailures.length} email${emailFailures.length !== 1 ? "s" : ""} failed to send`,
            items: emailFailures.map((f) => ({
              id: f.id,
              label: `To: ${f.to_email}`,
              meta: f.project_id
                ? `${f.source} · Project ${f.project_id.slice(0, 8)} · ${fmtDate(f.created_at)}`
                : `${f.source} · ${fmtDate(f.created_at)}`,
              actionLabel: "Details →",
              open: () => ({ type: "email-failure" as const, failure: f }),
            })),
          },
        ]
      : []),
  ];

  return (
    <>
      {actionCount > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
            Action required
          </h2>
          <div className={`grid grid-cols-1 gap-3 ${heroCategories.length > 1 ? "sm:grid-cols-2" : ""}`}>
            {heroCategories.map((cat) => (
              <HeroCard
                key={cat.key}
                category={cat}
                expanded={expandedKey === cat.key}
                onToggleExpand={() => setExpandedKey((k) => (k === cat.key ? null : cat.key))}
                onOpen={setDrawer}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Modal ── */}
      <Drawer
        isOpen={drawer !== null}
        onClose={closeDrawer}
        title={drawerTitle}
        subtitle={drawerSubtitle}
        successMessage={drawerSuccess ?? undefined}
        footer={
          drawerProjectId ? (
            <Link
              href={drawerAnchorId ? `/admin/projects/${drawerProjectId}#${drawerAnchorId}` : `/admin/projects/${drawerProjectId}`}
              onClick={closeDrawer}
              className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700"
            >
              Open full project profile →
            </Link>
          ) : undefined
        }
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
        {drawer?.type === "email-failure" && (
          <EmailFailureDrawerContent failure={drawer.failure} />
        )}
      </Drawer>
    </>
  );
}
