"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  finalizeSubmission,
  submitProject,
  type ExtractState,
  type TokenField,
} from "@/app/actions/submission";
import {
  requestSingleUploadUrl,
  processUploadedFile,
  confirmFileVerification,
  retryFileExtraction,
  removeUploadedFile,
  type DraftPipelineStatus,
} from "@/app/actions/submission-pipeline";
import { createClient } from "@/lib/supabase/client";
import { DocumentPreviewModal } from "@/components/DocumentPreviewModal";
import type { MetricsPickRow } from "@/lib/documents/metrics-autofill";
import { ClientWorkspace } from "../../_components/ClientWorkspace";
import { ClientHeaderCard } from "../../_components/ClientHeaderCard";
import { FocusCard } from "@/components/workspace/FocusCard";
import { REQUEST_STAGES } from "../../_components/requestStages";
import { FileSlot } from "./FileSlot";
import { canContinue } from "./continueGate";
import { useDraftPipelinePolling } from "./useDraftPipelinePolling";
import { Spinner } from "./shared";
import type { ClientPipelineFile, FileRequirement } from "./pipelineTypes";

interface Template {
  id: string;
  name: string;
}

interface Props {
  templates: Template[];
  defaultTemplateId: string | null;
  requirementsByTemplate?: Record<string, FileRequirement[]>;
  initialState?: ExtractState;
  adminOrgId?: string;
  adminClientId?: string;
  projectBasePath?: string;
  startOverHref?: string;
  showExtractionBanner?: boolean;
  beforeTemplateFields?: React.ReactNode;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// ── Field status badges (step 2) ──────────────────────────────────────────────

function DiscrepancyBadge({
  fieldKey,
  modified,
  hasCandidates,
}: {
  fieldKey: string;
  modified: Set<string>;
  hasCandidates?: boolean;
}) {
  if (modified.has(fieldKey)) return null;
  if (!hasCandidates) return null;
  return (
    <span className="shrink-0 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
      Multiple values found — please check
    </span>
  );
}

// Evidence-based "nothing found" signal — purely derived from the field being
// objectively empty, never from AI self-graded confidence (that concept was
// removed entirely). Mutually exclusive with DiscrepancyBadge's "documents
// disagree" state.
function NotFoundBadge({
  fieldKey,
  modified,
  isEmpty,
  hasCandidates,
}: {
  fieldKey: string;
  modified: Set<string>;
  isEmpty: boolean;
  hasCandidates?: boolean;
}) {
  if (modified.has(fieldKey)) return null;
  if (hasCandidates) return null;
  if (!isEmpty) return null;
  return (
    <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
      Not found — please fill in
    </span>
  );
}

function fieldClass(modified: Set<string>, fieldKey: string, hasCandidates?: boolean, isNotFound?: boolean) {
  if (modified.has(fieldKey)) return "border-zinc-200 bg-white focus:ring-zinc-400";
  if (hasCandidates) return "border-orange-300 bg-orange-50 focus:ring-orange-400";
  if (isNotFound) return "border-blue-200 bg-blue-50 focus:ring-blue-400";
  return "border-zinc-200 bg-zinc-50 focus:ring-zinc-400";
}

// ── Step 2 review form ────────────────────────────────────────────────────────

function TokenInput({
  field,
  modified,
  onMark,
  disabled,
  onValueChange,
  isExtractField,
}: {
  field: TokenField;
  modified: Set<string>;
  onMark: (k: string) => void;
  disabled?: boolean;
  // Lets a parent re-derive dependent fields (e.g. a metrics-table autofill
  // lookup keyed on this token) as the user types, instead of only seeing
  // the value at submit time via the form's own name-based field.
  onValueChange?: (token: string, value: string) => void;
  // True only for tokenGroups.extract fields. Org/client fields are never
  // AI-extracted and must never show the "not found" marker.
  isExtractField?: boolean;
}) {
  const hasCandidates = (field.candidates?.length ?? 0) > 1;
  // Evidence-based "nothing found" signal — purely derived from the field
  // being objectively empty, never from AI self-graded confidence.
  const isNotFound = Boolean(isExtractField) && field.required && !field.value.trim() && !hasCandidates;
  const [value, setValue] = useState(field.value);

  return (
    <div>
      <label className="mb-1 flex items-center justify-between gap-2 text-xs font-medium text-zinc-700">
        <span>
          {field.label}
          {field.required && <span className="ml-0.5 text-red-500">*</span>}
        </span>
        <DiscrepancyBadge fieldKey={field.token} modified={modified} hasCandidates={hasCandidates} />
        <NotFoundBadge fieldKey={field.token} modified={modified} isEmpty={isNotFound} hasCandidates={hasCandidates} />
      </label>
      <input
        type="text"
        name={field.token}
        value={value}
        required={field.required}
        disabled={disabled}
        onChange={(e) => {
          setValue(e.target.value);
          onMark(field.token);
          onValueChange?.(field.token, e.target.value);
        }}
        className={`w-full rounded-md border px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60 ${fieldClass(modified, field.token, hasCandidates, isNotFound)}`}
      />
      {hasCandidates && (
        <div className="mt-2 space-y-1 rounded-md border border-orange-200 bg-orange-50/60 p-2">
          <p className="text-xs font-medium text-orange-800">
            Documents disagree — pick the correct value or edit it above:
          </p>
          {field.candidates!.map((c, i) => (
            <label
              key={`${c.value}-${i}`}
              className="flex cursor-pointer items-start gap-2 rounded px-1.5 py-1 text-xs text-zinc-700 hover:bg-orange-100"
            >
              <input
                type="radio"
                name={`${field.token}__pick`}
                disabled={disabled}
                checked={value === c.value}
                onChange={() => {
                  setValue(c.value);
                  onMark(field.token);
                  onValueChange?.(field.token, c.value);
                }}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium text-zinc-900">{c.value}</span>{" "}
                <span className="text-zinc-400">
                  ({c.source_document})
                </span>
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function resolveDefaultMatchValue(extractedValue: string, pickRows: MetricsPickRow[]): string {
  const needle = extractedValue.trim().toLowerCase();
  if (!needle) return "";
  return (
    pickRows.find((r) => r.matchValue.toLowerCase() === needle)?.matchValue ??
    pickRows.find(
      (r) =>
        r.matchValue.toLowerCase().includes(needle) ||
        needle.includes(r.matchValue.toLowerCase())
    )?.matchValue ??
    ""
  );
}

// Client-side mirror of resolveMetricsAutofill's exact-then-substring match —
// lets a metrics-table output (e.g. rainfall intensity) be re-derived live as
// the stakeholder edits the field it's keyed on, rather than staying frozen
// at whatever the initial server-side extraction pass produced.
function resolveAutofillOutput(
  matchValue: string,
  pickRows: MetricsPickRow[],
  outputToken: string
): string | null {
  const needle = matchValue.trim().toLowerCase();
  if (!needle) return null;
  const row =
    pickRows.find((r) => r.matchValue.toLowerCase() === needle) ??
    pickRows.find((r) => {
      const cell = r.matchValue.toLowerCase();
      return cell !== "" && (cell.includes(needle) || needle.includes(cell));
    });
  return row ? row.outputs[outputToken] ?? null : null;
}

interface ReviewStepProps {
  state: Extract<ExtractState, { step: 2 }>;
  submitAction: (payload: FormData) => void;
  submitPending: boolean;
  submitState: { error?: string; duplicateProjectId?: string };
  adminOrgId?: string;
  adminClientId?: string;
  projectBasePath: string;
  startOverHref: string;
  showBanner?: boolean;
}

function ReviewStep({ state, submitAction, submitPending, submitState, adminOrgId, adminClientId, projectBasePath, startOverHref, showBanner }: ReviewStepProps) {
  const {
    poNumber,
    tokenGroups,
    sectionLabels,
    hasTrustee,
    rainfallToken,
    matchToken,
    pickRows,
    rainfallMatchToken,
    rainfallPickRows,
    projectId,
    templateId,
    documents,
  } = state;

  const [modified, setModified] = useState<Set<string>>(new Set());
  const mark = (key: string) => setModified((prev) => new Set(prev).add(key));

  // Live-tracks every extract-field value as the user types, so a
  // metrics-table autofill output (rainfall intensity) keyed on one of these
  // fields (e.g. Development Name) can be re-resolved without waiting for a
  // form submit round-trip.
  const [liveExtractValues, setLiveExtractValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(tokenGroups.extract.map((f) => [f.token, f.value]))
  );
  const handleExtractValueChange = (token: string, value: string) =>
    setLiveExtractValues((prev) => ({ ...prev, [token]: value }));

  const [reviewedConfirmed, setReviewedConfirmed] = useState(false);

  const [bannerVisible, setBannerVisible] = useState(showBanner ?? false);
  useEffect(() => {
    if (!showBanner) return;
    const t = setTimeout(() => setBannerVisible(false), 4500);
    return () => clearTimeout(t);
  }, [showBanner]);

  const matchField = matchToken ? tokenGroups.extract.find((t) => t.token === matchToken) : undefined;
  const trusteeField = tokenGroups.extract.find((t) => t.token === "EXTRACT_TRUSTEE");
  const trusteeLabel = trusteeField?.label ?? "Trustee";
  const [selectedMatchValue, setSelectedMatchValue] = useState(() =>
    matchField?.value ? resolveDefaultMatchValue(matchField.value, pickRows) : ""
  );
  const selectedTrusteeEntity =
    pickRows.find((r) => r.matchValue === selectedMatchValue)?.outputs["EXTRACT_TRUSTEE"] ?? "";

  const rainfallField = rainfallToken
    ? tokenGroups.extract.find((t) => t.token === rainfallToken)
    : null;
  // Re-run the same match the server used to originally populate rainfall
  // intensity, but against the field's *current* value — so correcting a
  // failed Development Name extraction re-derives rainfall intensity instead
  // of submitting whatever (possibly empty) value the initial pass left.
  const rainfallMatchValue = rainfallMatchToken ? liveExtractValues[rainfallMatchToken] ?? "" : "";
  const rainfallResolvedValue =
    rainfallMatchToken && rainfallToken
      ? resolveAutofillOutput(rainfallMatchValue, rainfallPickRows, rainfallToken)
      : null;
  const rainfallValue = rainfallResolvedValue ?? rainfallField?.value ?? "";
  const rainfallUnresolved =
    Boolean(rainfallMatchToken) && rainfallMatchValue.trim() !== "" && rainfallResolvedValue === null;

  const halcyonTokens = new Set(["EXTRACT_TRUSTEE", rainfallToken].filter(Boolean));
  const extractFieldsList = tokenGroups.extract.filter((t) => !halcyonTokens.has(t.token));

  // Evidence-based count for the page-level banner below — same required +
  // empty + no-candidates condition as TokenInput's isNotFound, computed once
  // here so the banner and the per-field markers can never disagree.
  const notFoundCount = extractFieldsList.filter(
    (f) => f.required && !f.value.trim() && (f.candidates?.length ?? 0) <= 1 && !modified.has(f.token)
  ).length;

  // Warn before unload while submitting
  useEffect(() => {
    if (!submitPending) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [submitPending]);

  const addressField = tokenGroups.extract.find((t) => t.token === "EXTRACT_ADDRESS");
  const title = addressField?.value || (poNumber.value ? `PO ${poNumber.value}` : "Review your request");

  return (
    <div className="relative">
      {bannerVisible && (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-white/40">
          <div className="mx-4 w-full max-w-sm rounded-xl border border-green-200 bg-white p-8 shadow-xl text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <svg className="h-6 w-6 text-green-600" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
              </svg>
            </div>
            <p className="text-base font-semibold text-zinc-900">Extraction complete</p>
            <p className="mt-2 text-sm text-zinc-500">
              We&apos;ve extracted the details from your documents. Review each field — if anything looks incorrect, update it before submitting.
            </p>
            <button
              type="button"
              onClick={() => setBannerVisible(false)}
              className="mt-6 w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
            >
              Review details
            </button>
          </div>
        </div>
      )}

      {submitPending && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 rounded-lg bg-white/80 backdrop-blur-sm">
          <Spinner className="h-8 w-8 text-zinc-400" />
          <p className="text-sm font-medium text-zinc-700">Submitting your request…</p>
        </div>
      )}

      {/* The whole workspace lives inside one <form> — the confirm/submit
          controls sit in the FocusCard (left column) while the actual field
          inputs render in the Overview tab (right column), but since
          ClientWorkspace is just JSX composed here, both are DOM descendants
          of this single <form> and submit together as one payload. */}
      <form action={submitAction}>
        <input type="hidden" name="project_id" value={projectId} />
        <input type="hidden" name="template_id" value={templateId} />
        <input type="hidden" name="extracted_po_number" value={poNumber.value} />
        {adminOrgId && <input type="hidden" name="admin_org_id" value={adminOrgId} />}
        {adminClientId && <input type="hidden" name="admin_client_id" value={adminClientId} />}
        {hasTrustee && (
          <input type="hidden" name="EXTRACT_TRUSTEE" value={selectedTrusteeEntity} />
        )}
        {rainfallToken && rainfallField && (
          <input type="hidden" name={rainfallToken} value={rainfallValue} />
        )}

        <ClientWorkspace
          header={
            <ClientHeaderCard
              title={title}
              subtitle="Review the extracted details on the right, then confirm and submit."
            />
          }
          stages={REQUEST_STAGES}
          focusCard={
            <FocusCard tone="neutral" title="Confirm & submit" subtitle="The last thing before we get started.">
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-700">
                    Also send final report to (optional)
                  </label>
                  <input
                    type="email"
                    name="delivery_recipient_email"
                    placeholder="additional@example.com"
                    disabled={submitPending}
                    className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>

                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-3 has-[:checked]:border-blue-400">
                  <input
                    type="checkbox"
                    name="reviewed_confirmed"
                    value="true"
                    checked={reviewedConfirmed}
                    onChange={(e) => setReviewedConfirmed(e.target.checked)}
                    disabled={submitPending}
                    className="mt-0.5 h-4 w-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-blue-900">
                    <span className="font-medium">I confirm I have reviewed the details</span> and that
                    they are correct.
                  </span>
                </label>

                {submitState.duplicateProjectId ? (
                  <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                    {submitState.error}{" "}
                    <a
                      href={`${projectBasePath}/${submitState.duplicateProjectId}`}
                      className="font-medium underline hover:text-red-900"
                    >
                      View existing project →
                    </a>
                  </div>
                ) : submitState.error ? (
                  <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{submitState.error}</p>
                ) : null}

                <button
                  type="submit"
                  disabled={submitPending || !reviewedConfirmed}
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
                >
                  {submitPending && <Spinner className="h-4 w-4" />}
                  {submitPending ? "Submitting…" : "Submit report request"}
                </button>
                {!submitPending && (
                  <a href={startOverHref} className="block text-center text-sm text-zinc-500 hover:text-zinc-700">
                    Start over
                  </a>
                )}
              </div>
            </FocusCard>
          }
          overviewTab={
            <div className="space-y-3">
              {notFoundCount > 0 && (
                <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                  <p className="font-medium">
                    {notFoundCount === 1
                      ? "We couldn't find 1 required detail in your documents."
                      : `We couldn't find ${notFoundCount} required details in your documents.`}
                  </p>
                  <p className="mt-1 text-blue-700">
                    Fields marked &quot;Not found&quot; below are empty — please fill them in yourself before
                    submitting.
                  </p>
                </div>
              )}
              {extractFieldsList.length > 0 && (
                <div className="rounded-lg border border-zinc-200 bg-white p-6">
                  <h2 className="mb-1 text-sm font-semibold text-zinc-900">{sectionLabels.extract}</h2>
                  {sectionLabels.extractDesc && <p className="mb-5 text-sm text-zinc-500">{sectionLabels.extractDesc}</p>}
                  <div className="space-y-4">
                    {extractFieldsList.map((field) => (
                      <div key={field.token}>
                        <TokenInput
                          field={field}
                          modified={modified}
                          onMark={mark}
                          disabled={submitPending}
                          onValueChange={handleExtractValueChange}
                          isExtractField
                        />
                        {field.token === rainfallMatchToken && rainfallUnresolved && (
                          <p className="mt-1 text-xs text-red-600">
                            No rainfall intensity match found for this value — check the spelling
                            against the lookup table before submitting.
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {hasTrustee && (
                <div className="rounded-lg border border-zinc-200 bg-white p-6">
                  <h2 className="mb-1 text-sm font-semibold text-zinc-900">{trusteeLabel}</h2>
                  {sectionLabels.trusteeDesc && <p className="mb-5 text-sm text-zinc-500">{sectionLabels.trusteeDesc}</p>}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-700">{trusteeLabel}</label>
                    <select
                      value={selectedMatchValue}
                      onChange={(e) => setSelectedMatchValue(e.target.value)}
                      disabled={submitPending}
                      className="w-full rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {selectedMatchValue === "" && <option value="">— select trustee —</option>}
                      {pickRows.map((r) => (
                        <option key={r.matchValue} value={r.matchValue}>
                          {r.matchValue} — {r.outputs["EXTRACT_TRUSTEE"]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {tokenGroups.org.length > 0 && (
                <div className="rounded-lg border border-zinc-200 bg-white p-6">
                  <h2 className="mb-1 text-sm font-semibold text-zinc-900">{sectionLabels.org}</h2>
                  {sectionLabels.orgDesc && <p className="mb-5 text-sm text-zinc-500">{sectionLabels.orgDesc}</p>}
                  <div className="space-y-4">
                    {tokenGroups.org.map((field) => (
                      <TokenInput key={field.token} field={field} modified={modified} onMark={mark} disabled={submitPending} />
                    ))}
                  </div>
                </div>
              )}

              {tokenGroups.client.length > 0 && (
                <div className="rounded-lg border border-zinc-200 bg-white p-6">
                  <h2 className="mb-1 text-sm font-semibold text-zinc-900">{sectionLabels.client}</h2>
                  {sectionLabels.clientDesc && <p className="mb-5 text-sm text-zinc-500">{sectionLabels.clientDesc}</p>}
                  <div className="space-y-4">
                    {tokenGroups.client.map((field) => (
                      <TokenInput key={field.token} field={field} modified={modified} onMark={mark} disabled={submitPending} />
                    ))}
                  </div>
                </div>
              )}
              <p className="text-xs text-zinc-400">
                Fields marked <span className="text-red-500">*</span> are required before submitting.
              </p>
            </div>
          }
          documentsTab={
            documents.length > 0 ? (
              <div className="space-y-2">
                {documents.map((d) => (
                  <div
                    key={d.slug}
                    className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-zinc-900">{d.label}</p>
                      <p className="truncate text-xs text-zinc-500">{d.name}</p>
                    </div>
                    <DocumentPreviewModal href={d.previewUrl} filename={d.name} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-zinc-200 bg-white px-5 py-6 text-sm text-zinc-500">
                No documents uploaded yet.
              </div>
            )
          }
          reviewTab={
            <div className="rounded-lg border border-zinc-200 bg-white px-5 py-6 text-sm text-zinc-500">
              No review requested yet.
            </div>
          }
        />
      </form>
    </div>
  );
}

// ── Main form ─────────────────────────────────────────────────────────────────

export function SubmissionForm({
  templates,
  defaultTemplateId,
  requirementsByTemplate = {},
  initialState,
  adminOrgId,
  adminClientId,
  projectBasePath = "/portal/projects",
  startOverHref = "/portal/submit",
  showExtractionBanner = false,
  beforeTemplateFields,
}: Props) {
  const [submitState, submitAction, submitPending] = useActionState(submitProject, {});

  // #115: either the live per-file upload pipeline (step 1) or the review
  // step (step 2, reached via Continue or passed in already-resolved for a
  // resumed draft).
  const [reviewState, setReviewState] = useState<Extract<ExtractState, { step: 2 }> | null>(
    initialState?.step === 2 ? initialState : null
  );

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    defaultTemplateId ?? (templates.length === 1 ? templates[0].id : "")
  );

  // Stable per-session draft id, generated once and reused for every file in
  // this upload session (#115) — this is what makes createDraftProjectIfAbsent
  // idempotent-by-construction rather than needing a "who's first" race.
  const projectIdRef = useRef<string>(crypto.randomUUID());

  const [files, setFiles] = useState<ClientPipelineFile[]>([]);
  const [continueError, setContinueError] = useState<string | null>(null);
  const [continueDuplicateId, setContinueDuplicateId] = useState<string | null>(null);
  const [continuePending, setContinuePending] = useState(false);

  const currentRequirements = requirementsByTemplate[selectedTemplateId] ?? [];

  const anyUnsettled = files.some(
    (f) => !f.uploading && !f.error && (f.extractionStatus === "running" || f.extractionStatus === "pending" || !f.verificationCompleted)
  );

  // Defensive reconciliation with server state — every direct action call
  // below already updates local state from its own return value, so this is
  // a safety net (a lost response, a backgrounded tab) plus what would
  // rehydrate an in-progress draft on refresh, not the primary state path.
  useDraftPipelinePolling(
    files.length > 0 ? projectIdRef.current : null,
    selectedTemplateId,
    anyUnsettled,
    (status: DraftPipelineStatus) => {
      setFiles((prev) =>
        prev.map((f) => {
          if (!f.fileId) return f;
          const match = status.files.find((s) => s.fileId === f.fileId);
          if (!match) return f;
          return {
            ...f,
            verificationCompleted: match.verificationCompleted,
            mismatchReasons: match.mismatchReasons,
            confirmed: match.confirmed,
            extractionStatus: match.extractionStatus,
            extractionError: match.extractionError,
          };
        })
      );
    }
  );

  async function handleAddFiles(requirement: FileRequirement, newFiles: File[]) {
    for (const file of newFiles) {
      const localId = crypto.randomUUID();
      const objectUrl = URL.createObjectURL(file);
      setFiles((prev) => [
        ...prev,
        {
          localId,
          requirementId: requirement.id,
          slug: requirement.slug,
          name: file.name,
          size: file.size,
          objectUrl,
          fileId: null,
          uploading: true,
          error: null,
          verificationCompleted: false,
          mismatchReasons: null,
          confirmed: false,
          extractionStatus: "not_applicable",
          extractionError: null,
        },
      ]);

      try {
        const uploadResult = await requestSingleUploadUrl(
          projectIdRef.current,
          selectedTemplateId,
          adminOrgId ?? null,
          adminClientId ?? null,
          requirement.slug,
          { name: file.name, size: file.size }
        );
        if ("error" in uploadResult) throw new Error(uploadResult.error);

        const supabase = createClient();
        const { error: uploadErr } = await supabase.storage
          .from("submissions")
          .uploadToSignedUrl(uploadResult.path, uploadResult.token, file, {
            contentType: file.type || "application/pdf",
          });
        if (uploadErr) throw new Error(`Failed to upload "${file.name}". Please try again.`);

        const processed = await processUploadedFile(
          projectIdRef.current,
          selectedTemplateId,
          adminOrgId ?? null,
          adminClientId ?? null,
          requirement.id,
          requirement.slug,
          file.name,
          uploadResult.path
        );
        if (processed.error) throw new Error(processed.error);

        setFiles((prev) =>
          prev.map((f) =>
            f.localId === localId
              ? {
                  ...f,
                  uploading: false,
                  fileId: processed.fileId ?? null,
                  verificationCompleted: true,
                  mismatchReasons: processed.mismatchReasons ?? null,
                  extractionStatus: processed.extractionStatus ?? "not_applicable",
                  extractionError: processed.extractionError ?? null,
                }
              : f
          )
        );
      } catch (err) {
        setFiles((prev) =>
          prev.map((f) =>
            f.localId === localId
              ? { ...f, uploading: false, error: err instanceof Error ? err.message : "Upload failed." }
              : f
          )
        );
      }
    }
  }

  async function handleRemove(localId: string) {
    const target = files.find((f) => f.localId === localId);
    if (!target) return;
    setFiles((prev) => prev.filter((f) => f.localId !== localId));
    URL.revokeObjectURL(target.objectUrl);
    if (target.fileId) await removeUploadedFile(target.fileId);
  }

  async function handleConfirm(localId: string) {
    const target = files.find((f) => f.localId === localId);
    if (!target?.fileId) return;
    setFiles((prev) => prev.map((f) => (f.localId === localId ? { ...f, confirmed: true } : f)));
    const result = await confirmFileVerification(target.fileId);
    setFiles((prev) =>
      prev.map((f) =>
        f.localId === localId
          ? {
              ...f,
              extractionStatus: result.extractionStatus ?? f.extractionStatus,
              extractionError: result.extractionError ?? null,
            }
          : f
      )
    );
  }

  async function handleRetry(localId: string) {
    const target = files.find((f) => f.localId === localId);
    if (!target?.fileId) return;
    setFiles((prev) =>
      prev.map((f) => (f.localId === localId ? { ...f, extractionStatus: "running", extractionError: null } : f))
    );
    const result = await retryFileExtraction(target.fileId);
    setFiles((prev) =>
      prev.map((f) =>
        f.localId === localId
          ? {
              ...f,
              extractionStatus: result.extractionStatus ?? "failed",
              extractionError: result.extractionError ?? result.error ?? null,
            }
          : f
      )
    );
  }

  const ready =
    !files.some((f) => f.uploading || f.error) &&
    canContinue(
      files.map((f) => ({
        slug: f.slug,
        verificationCompleted: f.verificationCompleted,
        mismatchReasons: f.mismatchReasons,
        confirmed: f.confirmed,
        extractionStatus: f.extractionStatus,
      })),
      currentRequirements.map((r) => ({ slug: r.slug, required: r.required }))
    );

  async function handleContinue() {
    if (!selectedTemplateId) return;
    setContinuePending(true);
    setContinueError(null);
    setContinueDuplicateId(null);
    const result = await finalizeSubmission(projectIdRef.current, selectedTemplateId, adminOrgId ?? null, adminClientId ?? null);
    setContinuePending(false);
    if (result.step === 2) {
      setReviewState(result);
    } else {
      setContinueError(result.error ?? "Something went wrong. Please try again.");
      setContinueDuplicateId(result.duplicateProjectId ?? null);
    }
  }

  function handleTemplateChange(id: string) {
    setSelectedTemplateId(id);
    setFiles([]);
    setContinueError(null);
    setContinueDuplicateId(null);
    projectIdRef.current = crypto.randomUUID();
  }

  // Warn before unload while anything is in flight
  useEffect(() => {
    const inFlight = files.some((f) => f.uploading) || continuePending;
    if (!inFlight) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [files, continuePending]);

  if (reviewState) {
    return (
      <ReviewStep
        state={reviewState}
        submitAction={submitAction}
        submitPending={submitPending}
        submitState={submitState}
        adminOrgId={adminOrgId}
        adminClientId={adminClientId}
        projectBasePath={projectBasePath}
        startOverHref={startOverHref}
        showBanner={showExtractionBanner}
      />
    );
  }

  const showTemplateDropdown = templates.length > 1;

  return (
    <ClientWorkspace
      header={
        <ClientHeaderCard
          title="New report request"
        />
      }
      stages={REQUEST_STAGES}
      focusCard={
        <FocusCard tone="neutral" title="Start your request" subtitle="upload the appropriate pdf files">
          <RequestForm
            projectBasePath={projectBasePath}
            showTemplateDropdown={showTemplateDropdown}
            templates={templates}
            selectedTemplateId={selectedTemplateId}
            setSelectedTemplateId={handleTemplateChange}
            currentRequirements={currentRequirements}
            files={files}
            onAddFiles={handleAddFiles}
            onRemove={handleRemove}
            onConfirm={handleConfirm}
            onRetry={handleRetry}
            ready={ready}
            continuePending={continuePending}
            continueError={continueError}
            continueDuplicateId={continueDuplicateId}
            onContinue={handleContinue}
            beforeTemplateFields={beforeTemplateFields}
          />
        </FocusCard>
      }
      overviewTab={
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-zinc-900">What&apos;s happening</h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600">
            Attach your documents on the left. Each one is checked and processed the moment it
            uploads, so once everything below turns green this page becomes your report request
            record.
          </p>
        </div>
      }
      documentsTab={
        <div className="rounded-lg border border-zinc-200 bg-white px-5 py-6 text-sm text-zinc-500">
          Your uploaded documents and the reports we produce will appear here once you submit.
        </div>
      }
      reviewTab={
        <div className="rounded-lg border border-zinc-200 bg-white px-5 py-6 text-sm text-zinc-500">
          No review requested yet.
        </div>
      }
    />
  );
}

function RequestForm({
  projectBasePath,
  showTemplateDropdown,
  templates,
  selectedTemplateId,
  setSelectedTemplateId,
  currentRequirements,
  files,
  onAddFiles,
  onRemove,
  onConfirm,
  onRetry,
  ready,
  continuePending,
  continueError,
  continueDuplicateId,
  onContinue,
  beforeTemplateFields,
}: {
  projectBasePath: string;
  showTemplateDropdown: boolean;
  templates: Template[];
  selectedTemplateId: string;
  setSelectedTemplateId: (id: string) => void;
  currentRequirements: FileRequirement[];
  files: ClientPipelineFile[];
  onAddFiles: (requirement: FileRequirement, files: File[]) => void;
  onRemove: (localId: string) => void;
  onConfirm: (localId: string) => void;
  onRetry: (localId: string) => void;
  ready: boolean;
  continuePending: boolean;
  continueError: string | null;
  continueDuplicateId: string | null;
  onContinue: () => void;
  beforeTemplateFields?: React.ReactNode;
}) {
  const disabled = continuePending;
  const hasAnyFiles = files.length > 0;

  return (
    <div className="space-y-6">
      {beforeTemplateFields}
      {/* Template selector — locked once files exist, since switching
          templates mid-pipeline would orphan the in-flight uploads. */}
      {showTemplateDropdown ? (
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-700">
            Report type <span className="text-red-500">*</span>
          </label>
          <select
            value={selectedTemplateId}
            onChange={(e) => setSelectedTemplateId(e.target.value)}
            disabled={disabled || hasAnyFiles}
            className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400 disabled:cursor-not-allowed disabled:opacity-50"
            required
          >
            <option value="">Select a report type…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      ) : null}

      {selectedTemplateId && (
        <div className="space-y-5">
          {currentRequirements.length === 0 ? (
            <p className="text-center text-sm text-zinc-400">
              No file uploads required for this report type.
            </p>
          ) : (
            currentRequirements.map((req) => (
              <FileSlot
                key={req.id}
                requirement={req}
                files={files.filter((f) => f.requirementId === req.id)}
                disabled={disabled}
                onAddFiles={onAddFiles}
                onRemove={onRemove}
                onConfirm={onConfirm}
                onRetry={onRetry}
              />
            ))
          )}
        </div>
      )}

      {continueError && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {continueError}
          {continueDuplicateId && (
            <>
              {" "}
              <a
                href={`${projectBasePath}/${continueDuplicateId}`}
                className="font-medium underline hover:text-red-900"
              >
                View existing project →
              </a>
            </>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={onContinue}
        disabled={!selectedTemplateId || !ready || continuePending}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {continuePending && <Spinner className="h-4 w-4" />}
        {continuePending ? "Preparing your request…" : "Continue"}
      </button>

      {!continuePending && !ready && (
        <p className="text-center text-xs text-zinc-400">
          {hasAnyFiles ? "Waiting for every file to finish processing…" : "Upload all required files to continue."}
        </p>
      )}
    </div>
  );
}
