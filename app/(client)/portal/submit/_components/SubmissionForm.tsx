"use client";

import { useActionState, useRef, useState } from "react";
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

interface Props {
  templates: Template[];
  defaultTemplateId: string | null;
  initialState?: ExtractState;
}

function resolveDefaultDevName(
  devName: string,
  developments: Development[]
): string {
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

function fieldClass(
  modified: Set<string>,
  fieldKey: string,
  confidence: Confidence
) {
  if (modified.has(fieldKey)) return "border-zinc-200 bg-white focus:ring-zinc-400";
  if (confidence === "low")
    return "border-red-300 bg-red-50 focus:ring-red-400";
  if (confidence === "medium")
    return "border-yellow-300 bg-yellow-50 focus:ring-yellow-400";
  return "border-zinc-200 bg-zinc-50 focus:ring-zinc-400";
}

// ── Step 2 review form ────────────────────────────────────────────────────────

interface ReviewStepProps {
  state: Extract<ExtractState, { step: 2 }>;
  submitAction: (payload: FormData) => void;
  submitPending: boolean;
  submitError?: string;
  submitState: { error?: string; duplicateProjectId?: string };
}

function ReviewStep({
  state,
  submitAction,
  submitPending,
  submitError,
  submitState,
}: ReviewStepProps) {
  const { poNumber, tokenGroups, hasTrustee, rainfallToken, developments, projectId, templateId } =
    state;

  const [modified, setModified] = useState<Set<string>>(new Set());
  const mark = (key: string) =>
    setModified((prev) => new Set(prev).add(key));

  const devNameField = tokenGroups.extract.find(
    (t) => t.token === "EXTRACT_DEV_NAME"
  );
  const trusteeField = tokenGroups.extract.find(
    (t) => t.token === "EXTRACT_TRUSTEE"
  );
  const trusteeLabel = trusteeField?.label ?? "Trustee";
  // Track selection by dev_name (unique) so controlled select doesn't snap to
  // a different development that shares the same trustee_entity value.
  const [selectedDevName, setSelectedDevName] = useState(() => {
    if (devNameField?.value)
      return resolveDefaultDevName(devNameField.value, developments);
    return "";
  });
  const selectedTrusteeEntity =
    developments.find((d) => d.dev_name === selectedDevName)?.trustee_entity ?? "";

  // Rainfall: halcyon-resolved, never shown to client — pass as hidden input
  const rainfallField = rainfallToken
    ? tokenGroups.extract.find((t) => t.token === rainfallToken)
    : null;

  // EXTRACT_ fields: exclude trustee (dropdown) and rainfall (hidden, from halcyon)
  const halcyonTokens = new Set(["EXTRACT_TRUSTEE", rainfallToken].filter(Boolean));
  const extractFields = tokenGroups.extract.filter(
    (t) => !halcyonTokens.has(t.token)
  );

  return (
    <form action={submitAction} className="space-y-6">
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="template_id" value={templateId} />
      <input
        type="hidden"
        name="extracted_po_number"
        value={poNumber.value}
      />
      {hasTrustee && (
        <input type="hidden" name="EXTRACT_TRUSTEE" value={selectedTrusteeEntity} />
      )}
      {rainfallToken && rainfallField && (
        <input type="hidden" name={rainfallToken} value={rainfallField.value} />
      )}

      {/* ── Extracted from documents ──────────────────────────────────── */}
      {extractFields.length > 0 && (
        <div className="rounded-lg border border-zinc-200 bg-white p-6">
          <h2 className="mb-1 text-sm font-semibold text-zinc-900">
            Extracted from your documents
          </h2>
          <p className="mb-5 text-sm text-zinc-500">
            Review and correct any fields marked below before submitting.
          </p>
          <div className="space-y-4">
            {extractFields.map((field) => (
              <TokenInput
                key={field.token}
                field={field}
                modified={modified}
                onMark={mark}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Trustee entity ─────────────────────────────────────────────── */}
      {hasTrustee && (
        <div className="rounded-lg border border-zinc-200 bg-white p-6">
          <h2 className="mb-1 text-sm font-semibold text-zinc-900">
            {trusteeLabel}
          </h2>
          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1">
              {trusteeLabel}
            </label>
            <select
              value={selectedDevName}
              onChange={(e) => setSelectedDevName(e.target.value)}
              className="w-full rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400"
            >
              {selectedDevName === "" && (
                <option value="">— select trustee —</option>
              )}
              {developments.map((d) => (
                <option key={d.dev_name} value={d.dev_name}>
                  {d.dev_name} — {d.trustee_entity}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* ── Organisation details ──────────────────────────────────────── */}
      {tokenGroups.org.length > 0 && (
        <div className="rounded-lg border border-zinc-200 bg-white p-6">
          <h2 className="mb-1 text-sm font-semibold text-zinc-900">
            Organisation details
          </h2>
          <div className="space-y-4">
            {tokenGroups.org.map((field) => (
              <TokenInput
                key={field.token}
                field={field}
                modified={modified}
                onMark={mark}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Additional information (CLIENT_ tokens) ───────────────────── */}
      {tokenGroups.client.length > 0 && (
        <div className="rounded-lg border border-zinc-200 bg-white p-6">
          <h2 className="mb-1 text-sm font-semibold text-zinc-900">
            Additional information
          </h2>
          <div className="space-y-4">
            {tokenGroups.client.map((field) => (
              <TokenInput
                key={field.token}
                field={field}
                modified={modified}
                onMark={mark}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Delivery ─────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-zinc-200 bg-white p-6">
        <h2 className="mb-1 text-sm font-semibold text-zinc-900">Delivery</h2>
        <div>
          <label className="block text-xs font-medium text-zinc-700 mb-1">
            Also send final report to (optional)
          </label>
          <input
            type="email"
            name="delivery_recipient_email"
            placeholder="additional@example.com"
            className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400"
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
      ) : submitError ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {submitError}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitPending}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {submitPending ? "Submitting…" : "Submit report request"}
        </button>
        <a
          href="/portal/submit"
          className="text-sm text-zinc-500 hover:text-zinc-700"
        >
          Start over
        </a>
      </div>
      <p className="text-xs text-zinc-400">
        Fields marked <span className="text-red-500">*</span> are required before submitting.
      </p>
    </form>
  );
}

function TokenInput({
  field,
  modified,
  onMark,
}: {
  field: TokenField;
  modified: Set<string>;
  onMark: (key: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-700 mb-1">
        {field.label}
        {field.required && <span className="ml-0.5 text-red-500">*</span>}
        <ConfidenceBadge
          fieldKey={field.token}
          confidence={field.confidence}
          modified={modified}
        />
      </label>
      <input
        type="text"
        name={field.token}
        defaultValue={field.value}
        required={field.required}
        onChange={() => onMark(field.token)}
        className={`w-full rounded-md border px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 ${fieldClass(
          modified,
          field.token,
          field.confidence
        )}`}
      />
    </div>
  );
}

// ── Main form component ───────────────────────────────────────────────────────

export function SubmissionForm({
  templates,
  defaultTemplateId,
  initialState,
}: Props) {
  const [extractState, extractAction, extractPending] = useActionState<
    ExtractState,
    FormData
  >(extractFields, initialState ?? { step: 1 });
  const [submitState, submitAction, submitPending] = useActionState(
    submitProject,
    {}
  );

  const [poFileName, setPoFileName] = useState<string | null>(null);
  const [plansFileName, setPlansFileName] = useState<string | null>(null);
  const [isDraggingPo, setIsDraggingPo] = useState(false);
  const [isDraggingPlans, setIsDraggingPlans] = useState(false);
  const poInputRef = useRef<HTMLInputElement>(null);
  const plansInputRef = useRef<HTMLInputElement>(null);

  function dropFile(
    e: React.DragEvent,
    inputRef: React.RefObject<HTMLInputElement | null>,
    setName: (n: string) => void,
    setDragging: (b: boolean) => void
  ) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (!file || !inputRef.current) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    inputRef.current.files = dt.files;
    setName(file.name);
  }

  if (extractState.step === 2) {
    return (
      <ReviewStep
        state={extractState}
        submitAction={submitAction}
        submitPending={submitPending}
        submitError={extractState.error ?? submitState.error}
        submitState={submitState}
      />
    );
  }

  // ── Step 1: file upload ─────────────────────────────────────────────────
  const showTemplateDropdown = templates.length > 1;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-6">
      <form action={extractAction} className="space-y-6">
        {showTemplateDropdown && (
          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1">
              Report type <span className="text-red-500">*</span>
            </label>
            <select
              name="template_id"
              className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400"
              required
            >
              <option value="">Select a report type…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {!showTemplateDropdown && defaultTemplateId && (
          <input
            type="hidden"
            name="template_id"
            value={defaultTemplateId}
          />
        )}

        <div>
          <label className="block text-xs font-medium text-zinc-700 mb-1">
            Purchase order (PDF){" "}
            <span className="text-zinc-400 font-normal">— optional</span>
          </label>
          <div
            className={`flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed px-4 py-8 text-center transition-colors ${
              isDraggingPo
                ? "border-zinc-500 bg-zinc-100"
                : "border-zinc-200 bg-zinc-50 hover:border-zinc-400 hover:bg-zinc-100"
            }`}
            onClick={() => poInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingPo(true);
            }}
            onDragLeave={() => setIsDraggingPo(false)}
            onDrop={(e) =>
              dropFile(e, poInputRef, setPoFileName, setIsDraggingPo)
            }
          >
            <input
              ref={poInputRef}
              type="file"
              name="po_file"
              accept="application/pdf"
              className="sr-only"
              onChange={(e) =>
                setPoFileName(e.target.files?.[0]?.name ?? null)
              }
            />
            {poFileName ? (
              <p className="text-sm font-medium text-zinc-800">{poFileName}</p>
            ) : (
              <>
                <p className="text-sm font-medium text-zinc-600">
                  Click or drag to upload PO document
                </p>
                <p className="mt-1 text-xs text-zinc-400">PDF up to 50 MB</p>
              </>
            )}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-700 mb-1">
            Building plans (PDF) <span className="text-red-500">*</span>
          </label>
          <div
            className={`flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed px-4 py-8 text-center transition-colors ${
              isDraggingPlans
                ? "border-zinc-500 bg-zinc-100"
                : "border-zinc-200 bg-zinc-50 hover:border-zinc-400 hover:bg-zinc-100"
            }`}
            onClick={() => plansInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingPlans(true);
            }}
            onDragLeave={() => setIsDraggingPlans(false)}
            onDrop={(e) =>
              dropFile(e, plansInputRef, setPlansFileName, setIsDraggingPlans)
            }
          >
            <input
              ref={plansInputRef}
              type="file"
              name="plans_file"
              accept="application/pdf"
              className="sr-only"
              required
              onChange={(e) =>
                setPlansFileName(e.target.files?.[0]?.name ?? null)
              }
            />
            {plansFileName ? (
              <p className="text-sm font-medium text-zinc-800">
                {plansFileName}
              </p>
            ) : (
              <>
                <p className="text-sm font-medium text-zinc-600">
                  Click or drag to upload building plans
                </p>
                <p className="mt-1 text-xs text-zinc-400">PDF up to 50 MB</p>
              </>
            )}
          </div>
        </div>

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
          disabled={extractPending}
          className="w-full rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {extractPending ? "Uploading and extracting…" : "Continue"}
        </button>
      </form>
    </div>
  );
}
