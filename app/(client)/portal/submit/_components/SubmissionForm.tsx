"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  extractFields,
  submitProject,
  type ExtractState,
  type TokenField,
  type Development,
} from "@/app/actions/submission";
import type { Confidence } from "@/lib/documents/extractor";

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
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 22 6.477 22 12h-4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
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

function resolveDefaultDevName(devName: string, developments: Development[]): string {
  const needle = devName.trim().toLowerCase();
  if (!needle) return "";
  return (
    developments.find((d) => d.dev_name.toLowerCase() === needle)?.dev_name ??
    developments.find(
      (d) =>
        d.dev_name.toLowerCase().includes(needle) ||
        needle.includes(d.dev_name.toLowerCase())
    )?.dev_name ??
    ""
  );
}

interface ReviewStepProps {
  state: Extract<ExtractState, { step: 2 }>;
  submitAction: (payload: FormData) => void;
  submitPending: boolean;
  submitState: { error?: string; duplicateProjectId?: string };
}

function ReviewStep({ state, submitAction, submitPending, submitState }: ReviewStepProps) {
  const { poNumber, tokenGroups, hasTrustee, rainfallToken, developments, projectId, templateId } = state;

  const [modified, setModified] = useState<Set<string>>(new Set());
  const mark = (key: string) => setModified((prev) => new Set(prev).add(key));

  const devNameField = tokenGroups.extract.find((t) => t.token === "EXTRACT_DEV_NAME");
  const trusteeField = tokenGroups.extract.find((t) => t.token === "EXTRACT_TRUSTEE");
  const trusteeLabel = trusteeField?.label ?? "Trustee";
  const [selectedDevName, setSelectedDevName] = useState(() =>
    devNameField?.value ? resolveDefaultDevName(devNameField.value, developments) : ""
  );
  const selectedTrusteeEntity =
    developments.find((d) => d.dev_name === selectedDevName)?.trustee_entity ?? "";

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
        {hasTrustee && (
          <input type="hidden" name="EXTRACT_TRUSTEE" value={selectedTrusteeEntity} />
        )}
        {rainfallToken && rainfallField && (
          <input type="hidden" name={rainfallToken} value={rainfallField.value} />
        )}

        {extractFieldsList.length > 0 && (
          <div className="rounded-lg border border-zinc-200 bg-white p-6">
            <h2 className="mb-1 text-sm font-semibold text-zinc-900">Extracted from your documents</h2>
            <p className="mb-5 text-sm text-zinc-500">Review and correct any fields marked below before submitting.</p>
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
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700">{trusteeLabel}</label>
              <select
                value={selectedDevName}
                onChange={(e) => setSelectedDevName(e.target.value)}
                disabled={submitPending}
                className="w-full rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {selectedDevName === "" && <option value="">— select trustee —</option>}
                {developments.map((d) => (
                  <option key={d.dev_name} value={d.dev_name}>
                    {d.dev_name} — {d.trustee_entity}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {tokenGroups.org.length > 0 && (
          <div className="rounded-lg border border-zinc-200 bg-white p-6">
            <h2 className="mb-1 text-sm font-semibold text-zinc-900">Organisation details</h2>
            <div className="space-y-4">
              {tokenGroups.org.map((field) => (
                <TokenInput key={field.token} field={field} modified={modified} onMark={mark} disabled={submitPending} />
              ))}
            </div>
          </div>
        )}

        {tokenGroups.client.length > 0 && (
          <div className="rounded-lg border border-zinc-200 bg-white p-6">
            <h2 className="mb-1 text-sm font-semibold text-zinc-900">Additional information</h2>
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

        {submitState.duplicateProjectId ? (
          <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {submitState.error}{" "}
            <a
              href={`/portal/projects/${submitState.duplicateProjectId}`}
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
            disabled={submitPending}
            className="flex items-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            {submitPending && <Spinner className="h-4 w-4" />}
            {submitPending ? "Submitting…" : "Submit report request"}
          </button>
          {!submitPending && (
            <a href="/portal/submit" className="text-sm text-zinc-500 hover:text-zinc-700">
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
  const inputRef = useRef<HTMLInputElement>(null);

  function applyFiles(list: FileList | null) {
    if (!list || disabled) return;
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

    if (inputRef.current) {
      const dt = new DataTransfer();
      arr.forEach((f) => dt.items.add(f));
      inputRef.current.files = dt.files;
    }
    setFileInfos(arr.map((f) => ({ name: f.name, size: f.size })));
    onHasFile(requirement.slug, arr.length > 0);
  }

  const multi = requirement.max_count > 1;
  const countLabel = multi ? ` (up to ${requirement.max_count})` : "";
  const hasFiles = fileInfos.length > 0;

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
        className={`flex min-h-[88px] flex-col items-center justify-center rounded-md border-2 border-dashed px-4 py-6 text-center transition-colors ${
          disabled
            ? "cursor-default border-zinc-100 bg-zinc-50"
            : isDragging
            ? "cursor-pointer border-zinc-500 bg-zinc-100"
            : hasFiles
            ? "cursor-pointer border-zinc-300 bg-white hover:border-zinc-400"
            : "cursor-pointer border-zinc-200 bg-zinc-50 hover:border-zinc-400 hover:bg-zinc-100"
        }`}
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setIsDragging(true); }}
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
          disabled={disabled}
          className="sr-only"
          onChange={(e) => applyFiles(e.target.files)}
        />

        {hasFiles ? (
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

  // Loading overlay — shown while files are being uploaded and analysed
  if (extractPending) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white">
        <div className="flex flex-col items-center gap-5 px-6 py-16">
          <Spinner className="h-9 w-9 text-zinc-400" />
          <div className="text-center">
            <p className="text-sm font-semibold text-zinc-900">
              Uploading and analysing your documents
            </p>
            <p className="mt-2 max-w-xs text-sm text-zinc-500">
              Please keep this window open. This can take up to a minute for large files.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (extractState.step === 2) {
    return (
      <ReviewStep
        state={extractState}
        submitAction={submitAction}
        submitPending={submitPending}
        submitState={submitState}
      />
    );
  }

  const showTemplateDropdown = templates.length > 1;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-6">
      <form action={extractAction} className="space-y-6">
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
              className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400"
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
                  disabled={false}
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
                  href={`/portal/projects/${extractState.duplicateProjectId}`}
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
          disabled={!selectedTemplateId || requiredUnfilled}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          Continue
        </button>

        {requiredUnfilled && (
          <p className="text-center text-xs text-zinc-400">
            Upload all required files to continue.
          </p>
        )}
      </form>
    </div>
  );
}
