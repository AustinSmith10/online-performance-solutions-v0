"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  extractFields,
  submitProject,
  type ExtractState,
  type TokenField,
} from "@/app/actions/submission";
import type { Confidence } from "@/lib/documents/extractor";
import type { MetricsPickRow } from "@/lib/documents/metrics-autofill";

interface Template {
  id: string;
  name: string;
}

interface FileRequirement {
  id: string;
  name: string;
  slug: string;
  max_count: number;
  required: boolean;
  no_duplicates: boolean;
  extraction: boolean;
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
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeOpacity="0.25" />
      <path
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.568 3 7.291l3-3.291z"
      />
    </svg>
  );
}

// ── Confidence badge (step 2) ─────────────────────────────────────────────────

function ConfidenceBadge({
  fieldKey,
  confidence,
  modified,
}: {
  fieldKey: string;
  confidence: Confidence;
  modified: Set<string>;
}) {
  if (confidence === "high" || modified.has(fieldKey)) return null;
  return (
    <span
      className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${
        confidence === "medium"
          ? "bg-yellow-100 text-yellow-700"
          : "bg-red-100 text-red-700"
      }`}
    >
      {confidence === "low" ? "Not found — please check" : "Low confidence"}
    </span>
  );
}

function fieldClass(modified: Set<string>, fieldKey: string, confidence: Confidence) {
  if (modified.has(fieldKey)) return "border-zinc-200 bg-white focus:ring-zinc-400";
  if (confidence === "low") return "border-red-300 bg-red-50 focus:ring-red-400";
  if (confidence === "medium") return "border-yellow-300 bg-yellow-50 focus:ring-yellow-400";
  return "border-zinc-200 bg-zinc-50 focus:ring-zinc-400";
}

// ── Step 2 review form ────────────────────────────────────────────────────────

function TokenInput({
  field,
  modified,
  onMark,
  disabled,
}: {
  field: TokenField;
  modified: Set<string>;
  onMark: (k: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-zinc-700">
        {field.label}
        {field.required && <span className="ml-0.5 text-red-500">*</span>}
        <ConfidenceBadge fieldKey={field.token} confidence={field.confidence} modified={modified} />
      </label>
      <input
        type="text"
        name={field.token}
        defaultValue={field.value}
        required={field.required}
        disabled={disabled}
        onChange={() => onMark(field.token)}
        className={`w-full rounded-md border px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60 ${fieldClass(modified, field.token, field.confidence)}`}
      />
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
  const { poNumber, tokenGroups, sectionLabels, hasTrustee, rainfallToken, matchToken, pickRows, projectId, templateId } = state;

  const [modified, setModified] = useState<Set<string>>(new Set());
  const mark = (key: string) => setModified((prev) => new Set(prev).add(key));

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

  const halcyonTokens = new Set(["EXTRACT_TRUSTEE", rainfallToken].filter(Boolean));
  const extractFieldsList = tokenGroups.extract.filter((t) => !halcyonTokens.has(t.token));

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

      <form action={submitAction} className="space-y-6">
        <input type="hidden" name="project_id" value={projectId} />
        <input type="hidden" name="template_id" value={templateId} />
        <input type="hidden" name="extracted_po_number" value={poNumber.value} />
        {adminOrgId && <input type="hidden" name="admin_org_id" value={adminOrgId} />}
        {adminClientId && <input type="hidden" name="admin_client_id" value={adminClientId} />}
        {hasTrustee && (
          <input type="hidden" name="EXTRACT_TRUSTEE" value={selectedTrusteeEntity} />
        )}
        {rainfallToken && rainfallField && (
          <input type="hidden" name={rainfallToken} value={rainfallField.value} />
        )}

        {extractFieldsList.length > 0 && (
          <div className="rounded-lg border border-zinc-200 bg-white p-6">
            <h2 className="mb-1 text-sm font-semibold text-zinc-900">{sectionLabels.extract}</h2>
            {sectionLabels.extractDesc && <p className="mb-5 text-sm text-zinc-500">{sectionLabels.extractDesc}</p>}
            <div className="space-y-4">
              {extractFieldsList.map((field) => (
                <TokenInput
                  key={field.token}
                  field={field}
                  modified={modified}
                  onMark={mark}
                  disabled={submitPending}
                />
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

        <div className="rounded-lg border border-zinc-200 bg-white p-6">
          <h2 className="mb-1 text-sm font-semibold text-zinc-900">Delivery</h2>
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
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 has-[:checked]:border-blue-400">
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
            <span className="font-medium">I confirm I have reviewed the details in this form</span> and
            that they are correct.
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

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={submitPending || !reviewedConfirmed}
            className="flex items-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            {submitPending && <Spinner className="h-4 w-4" />}
            {submitPending ? "Submitting…" : "Submit report request"}
          </button>
          {!submitPending && (
            <a href={startOverHref} className="text-sm text-zinc-500 hover:text-zinc-700">
              Start over
            </a>
          )}
        </div>
        <p className="text-xs text-zinc-400">
          Fields marked <span className="text-red-500">*</span> are required before submitting.
        </p>
      </form>
    </div>
  );
}

// ── File slot (step 1) ────────────────────────────────────────────────────────

function FileSlot({
  requirement,
  onHasFile,
  disabled,
}: {
  requirement: FileRequirement;
  onHasFile: (slug: string, has: boolean) => void;
  disabled?: boolean;
}) {
  const [fileInfos, setFileInfos] = useState<{ name: string; size: number }[]>([]);
  const [slotError, setSlotError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadPct, setLoadPct] = useState(0);
  const [loadingIn, setLoadingIn] = useState(false);
  const timerRef = useRef<{ iv: ReturnType<typeof setInterval>; to: ReturnType<typeof setTimeout> } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function startLoadAnimation() {
    if (timerRef.current) {
      clearInterval(timerRef.current.iv);
      clearTimeout(timerRef.current.to);
    }
    const duration = 2000;
    const start = Date.now();
    setLoadingIn(true);
    setLoadPct(0);
    const iv = setInterval(() => {
      setLoadPct(Math.min(100, ((Date.now() - start) / duration) * 100));
    }, 30);
    const to = setTimeout(() => {
      clearInterval(iv);
      setLoadPct(100);
      setLoadingIn(false);
      timerRef.current = null;
    }, duration);
    timerRef.current = { iv, to };
  }

  useEffect(() => () => {
    if (timerRef.current) {
      clearInterval(timerRef.current.iv);
      clearTimeout(timerRef.current.to);
    }
  }, []);

  function applyFiles(list: FileList | null) {
    if (!list || disabled || isLoading) return;
    const arr = Array.from(list).slice(0, requirement.max_count);
    if (arr.length === 0) return;

    // Client-side type check
    const nonPdf = arr.find(
      (f) => f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")
    );
    if (nonPdf) {
      setSlotError(`"${nonPdf.name}" is not a PDF. Only PDF files are accepted.`);
      return;
    }

    // Client-side size check (50 MB per file)
    const oversized = arr.find((f) => f.size > 50 * 1024 * 1024);
    if (oversized) {
      setSlotError(`"${oversized.name}" exceeds the 50 MB limit (${formatFileSize(oversized.size)}).`);
      return;
    }

    setSlotError(null);
    setIsLoading(true);
    onHasFile(requirement.slug, false);

    // Read the first 5 bytes of each file to confirm they are loaded and are real PDFs
    Promise.all(
      arr.map(
        (f) =>
          new Promise<void>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
              const bytes = new Uint8Array(e.target?.result as ArrayBuffer);
              const header = String.fromCharCode(...bytes);
              if (!header.startsWith("%PDF")) {
                reject(new Error(`"${f.name}" does not appear to be a valid PDF.`));
              } else {
                resolve();
              }
            };
            reader.onerror = () => reject(new Error(`Could not read "${f.name}".`));
            reader.readAsArrayBuffer(f.slice(0, 5));
          })
      )
    )
      .then(() => {
        if (inputRef.current) {
          const dt = new DataTransfer();
          arr.forEach((f) => dt.items.add(f));
          inputRef.current.files = dt.files;
        }
        setFileInfos(arr.map((f) => ({ name: f.name, size: f.size })));
        onHasFile(requirement.slug, true);
        startLoadAnimation();
      })
      .catch((err: Error) => {
        setSlotError(err.message);
        if (inputRef.current) inputRef.current.value = "";
      })
      .finally(() => setIsLoading(false));
  }

  const multi = requirement.max_count > 1;
  const countLabel = multi ? ` (up to ${requirement.max_count})` : "";
  const hasFiles = fileInfos.length > 0;
  const isBlocked = disabled || isLoading;

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-zinc-700">
        {requirement.name}
        {countLabel}
        {requirement.required ? (
          <span className="ml-0.5 text-red-500">*</span>
        ) : (
          <span className="ml-1 font-normal text-zinc-400">— optional</span>
        )}
      </label>

      <div
        className={`relative flex min-h-[88px] flex-col items-center justify-center overflow-hidden rounded-md border-2 border-dashed px-4 py-6 text-center transition-colors ${
          isBlocked && !loadingIn
            ? "cursor-default border-zinc-100 bg-zinc-50"
            : isBlocked
            ? "cursor-default border-zinc-100 bg-zinc-50"
            : isDragging
            ? "cursor-pointer border-zinc-500 bg-zinc-100"
            : hasFiles
            ? "cursor-pointer border-zinc-300 bg-white hover:border-zinc-400"
            : "cursor-pointer border-zinc-200 bg-zinc-50 hover:border-zinc-400 hover:bg-zinc-100"
        }`}
        onClick={() => !isBlocked && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); if (!isBlocked) setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          applyFiles(e.dataTransfer.files);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          name={requirement.slug}
          accept="application/pdf"
          multiple={multi}
          disabled={isBlocked}
          className="sr-only"
          onChange={(e) => applyFiles(e.target.files)}
        />

        {isLoading ? (
          <div className="flex flex-col items-center gap-2">
            <Spinner className="h-5 w-5 text-zinc-400" />
            <p className="text-xs text-zinc-400">Checking file…</p>
          </div>
        ) : loadingIn ? (
          <div className="w-full space-y-2 text-center">
            {fileInfos.map((f) => (
              <div key={f.name}>
                <p className="break-all text-sm font-medium text-zinc-800">{f.name}</p>
                <p className="text-xs text-zinc-400">{formatFileSize(f.size)}</p>
              </div>
            ))}
            <div className="mx-auto mt-1 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
              <div
                className="h-full rounded-full bg-green-500 transition-none"
                style={{ width: `${loadPct}%` }}
              />
            </div>
          </div>
        ) : hasFiles ? (
          <div className="w-full space-y-1 text-center">
            {fileInfos.map((f) => (
              <div key={f.name}>
                <p className="break-all text-sm font-medium text-zinc-800">{f.name}</p>
                <p className="text-xs text-zinc-400">{formatFileSize(f.size)}</p>
              </div>
            ))}
            {multi && (
              <p className="mt-1 text-xs text-zinc-400">
                {fileInfos.length} of {requirement.max_count} — click to change
              </p>
            )}
            {!disabled && (
              <p className="mt-1 text-xs text-zinc-400">Click to change</p>
            )}
          </div>
        ) : (
          <>
            <p className="text-sm font-medium text-zinc-600">
              Click or drag to upload {requirement.name.toLowerCase()}
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              PDF{multi ? `, up to ${requirement.max_count} files` : ""}, 50 MB each
            </p>
          </>
        )}
      </div>

      {slotError && (
        <p className="mt-1 text-xs text-red-600">{slotError}</p>
      )}
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
}: Props) {
  const [extractState, extractAction, extractPending] = useActionState<ExtractState, FormData>(
    extractFields,
    initialState ?? { step: 1 }
  );
  const [submitState, submitAction, submitPending] = useActionState(submitProject, {});

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    defaultTemplateId ?? (templates.length === 1 ? templates[0].id : "")
  );
  const [slotTracking, setSlotTracking] = useState<{
    forTemplate: string;
    slots: Record<string, boolean>;
  }>({ forTemplate: selectedTemplateId, slots: {} });

  const hasFileBySlot =
    slotTracking.forTemplate === selectedTemplateId ? slotTracking.slots : {};

  const currentRequirements = requirementsByTemplate[selectedTemplateId] ?? [];
  const requiredUnfilled = currentRequirements.some(
    (r) => r.required && !hasFileBySlot[r.slug]
  );

  function handleHasFile(slug: string, has: boolean) {
    setSlotTracking((prev) => {
      const base = prev.forTemplate === selectedTemplateId ? prev.slots : {};
      return { forTemplate: selectedTemplateId, slots: { ...base, [slug]: has } };
    });
  }

  // Warn before unload while uploading/processing
  useEffect(() => {
    if (!extractPending) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [extractPending]);

  if (extractState.step === 2) {
    return (
      <ReviewStep
        state={extractState}
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
    <div className="rounded-lg border border-zinc-200 bg-white p-6">
      <form action={extractAction} className="space-y-6">
        {adminOrgId && <input type="hidden" name="admin_org_id" value={adminOrgId} />}
        {adminClientId && <input type="hidden" name="admin_client_id" value={adminClientId} />}
        {/* Template selector */}
        {showTemplateDropdown ? (
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700">
              Report type <span className="text-red-500">*</span>
            </label>
            <select
              name="template_id"
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              disabled={extractPending}
              className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400 disabled:cursor-not-allowed disabled:opacity-50"
              required
            >
              <option value="">Select a report type…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        ) : (
          <input type="hidden" name="template_id" value={selectedTemplateId} />
        )}

        {/* File slots — remount on template change to clear state */}
        {selectedTemplateId && (
          <div key={selectedTemplateId} className="space-y-5">
            {currentRequirements.length === 0 ? (
              <p className="text-center text-sm text-zinc-400">
                No file uploads required for this report type.
              </p>
            ) : (
              currentRequirements.map((req) => (
                <FileSlot
                  key={req.id}
                  requirement={req}
                  onHasFile={handleHasFile}
                  disabled={extractPending}
                />
              ))
            )}
          </div>
        )}

        {extractState.error && (
          <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {extractState.error}
            {extractState.duplicateProjectId && (
              <>
                {" "}
                <a
                  href={`${projectBasePath}/${extractState.duplicateProjectId}`}
                  className="font-medium underline hover:text-red-900"
                >
                  View existing project →
                </a>
              </>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={!selectedTemplateId || requiredUnfilled || extractPending}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {extractPending && <Spinner className="h-4 w-4" />}
          {extractPending ? "Uploading…" : "Continue"}
        </button>

        {!extractPending && requiredUnfilled && (
          <p className="text-center text-xs text-zinc-400">
            Upload all required files to continue.
          </p>
        )}
        {extractPending && (
          <p className="text-center text-xs text-zinc-400">
            Please keep this window open. This can take up to a minute for large files.
          </p>
        )}
      </form>
    </div>
  );
}
