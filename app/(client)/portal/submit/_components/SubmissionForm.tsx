"use client";

import { useActionState, useRef, useState } from "react";
import {
  extractFields,
  submitProject,
  type ExtractState,
  type Development,
} from "@/app/actions/submission";
import type { ExtractionResult } from "@/lib/documents/extractor";

interface Template {
  id: string;
  name: string;
}

interface Props {
  templates: Template[];
  defaultTemplateId: string | null;
  initialState?: ExtractState;
}

const EXTRACT_FIELD_LABELS: Record<string, string> = {
  house_type: "House / dwelling type",
  site_wd_no: "Site working drawing no.",
  floor_wd_no: "Floor working drawing no.",
  roof_wd_no: "Roof working drawing no.",
  draw_date: "Drawing date",
  dev_name: "Development name",
};

const ORG_FIELD_LABELS: Record<string, string> = {
  ORG_BUILDER_COY: "Builder company",
  ORG_CERTIFIER_COY: "Certifier company",
  ORG_CERTIFIER_NAME: "Certifier name",
};

function resolveDefaultTrustee(devName: string, developments: Development[]): string {
  const needle = devName.trim().toLowerCase();
  if (!needle) return "";
  return (
    developments.find((d) => d.dev_name.toLowerCase() === needle)?.trustee_entity ??
    developments.find(
      (d) =>
        d.dev_name.toLowerCase().includes(needle) ||
        needle.includes(d.dev_name.toLowerCase())
    )?.trustee_entity ??
    ""
  );
}

function ConfidenceBadge({
  fieldKey,
  confidence,
  modified,
}: {
  fieldKey: string;
  confidence: "high" | "medium" | "low";
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

function fieldClass(modified: Set<string>, fieldKey: string, confidence: "high" | "medium" | "low") {
  if (modified.has(fieldKey)) return "border-zinc-200 bg-white focus:ring-zinc-400";
  if (confidence === "low") return "border-red-300 bg-red-50 focus:ring-red-400";
  if (confidence === "medium") return "border-yellow-300 bg-yellow-50 focus:ring-yellow-400";
  return "border-zinc-200 bg-zinc-50 focus:ring-zinc-400";
}

// ── Step 2 review form ────────────────────────────────────────────────────────
// Separate component so useState initialises fresh each time extraction completes.

interface ReviewStepProps {
  state: Extract<ExtractState, { step: 2 }>;
  submitAction: (payload: FormData) => void;
  submitPending: boolean;
  submitError?: string;
}

function ReviewStep({ state, submitAction, submitPending, submitError }: ReviewStepProps) {
  const { extracted, projectId, templateId, orgConfig, developments } = state;

  const [modified, setModified] = useState<Set<string>>(new Set());
  const markModified = (key: string) =>
    setModified((prev) => new Set(prev).add(key));

  const [selectedTrustee, setSelectedTrustee] = useState(() =>
    resolveDefaultTrustee(extracted.dev_name.value, developments)
  );

  function fc(fieldKey: string, confidence: "high" | "medium" | "low") {
    return fieldClass(modified, fieldKey, confidence);
  }

  return (
    <form action={submitAction} className="space-y-6">
      {/* Pass-through hidden fields */}
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="template_id" value={templateId} />
      <input type="hidden" name="extracted_po_number" value={extracted.po_number.value} />
      {/* Trustee value from controlled select */}
      <input type="hidden" name="EXTRACT_TRUSTEE" value={selectedTrustee} />

      {/* ── Extracted from documents ─────────────────────────────────── */}
      <div className="rounded-lg border border-zinc-200 bg-white p-6">
        <h2 className="mb-1 text-sm font-semibold text-zinc-900">Extracted from your documents</h2>
        <p className="mb-5 text-sm text-zinc-500">
          Review and correct any fields marked below before submitting.
        </p>
        <div className="space-y-4">
          {(Object.keys(EXTRACT_FIELD_LABELS) as (keyof typeof EXTRACT_FIELD_LABELS)[]).map((key) => {
            const field = extracted[key as keyof ExtractionResult];
            return (
              <div key={key}>
                <label className="block text-xs font-medium text-zinc-700 mb-1">
                  {EXTRACT_FIELD_LABELS[key]}
                  <ConfidenceBadge fieldKey={key} confidence={field.confidence} modified={modified} />
                </label>
                <input
                  type="text"
                  name={`extracted_${key}`}
                  defaultValue={field.value}
                  onChange={() => markModified(key)}
                  className={`w-full rounded-md border px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 ${fc(key, field.confidence)}`}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Trustee entity ────────────────────────────────────────────── */}
      <div className="rounded-lg border border-zinc-200 bg-white p-6">
        <h2 className="mb-1 text-sm font-semibold text-zinc-900">Trustee entity</h2>
        <p className="mb-5 text-sm text-zinc-500">
          Auto-resolved from the development name. Select the correct trustee if needed.
        </p>
        <div>
          <label className="block text-xs font-medium text-zinc-700 mb-1">Trustee</label>
          <select
            value={selectedTrustee}
            onChange={(e) => setSelectedTrustee(e.target.value)}
            className="w-full rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400"
          >
            {selectedTrustee === "" && (
              <option value="">— select trustee —</option>
            )}
            {developments.map((d) => (
              <option key={d.dev_name} value={d.trustee_entity}>
                {d.dev_name} — {d.trustee_entity}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Organisation details ──────────────────────────────────────── */}
      <div className="rounded-lg border border-zinc-200 bg-white p-6">
        <h2 className="mb-1 text-sm font-semibold text-zinc-900">Organisation details</h2>
        <p className="mb-5 text-sm text-zinc-500">
          Pre-filled from your organisation&apos;s configuration. Edit if anything has changed.
        </p>
        <div className="space-y-4">
          {(Object.keys(ORG_FIELD_LABELS) as (keyof typeof ORG_FIELD_LABELS)[]).map((key) => (
            <div key={key}>
              <label className="block text-xs font-medium text-zinc-700 mb-1">
                {ORG_FIELD_LABELS[key]}
              </label>
              <input
                type="text"
                name={key}
                defaultValue={orgConfig[key] ?? ""}
                className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400"
              />
            </div>
          ))}
        </div>
      </div>

      {/* ── Site & delivery ───────────────────────────────────────────── */}
      <div className="rounded-lg border border-zinc-200 bg-white p-6">
        <h2 className="mb-1 text-sm font-semibold text-zinc-900">Site &amp; delivery</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1">
              Site / project address <span className="text-red-500">*</span>
              <ConfidenceBadge
                fieldKey="client_address"
                confidence={extracted.client_address.confidence}
                modified={modified}
              />
            </label>
            <input
              type="text"
              name="client_address"
              defaultValue={extracted.client_address.value}
              onChange={() => markModified("client_address")}
              placeholder="e.g. 12 Acacia Street, Burpengary QLD 4505"
              className={`w-full rounded-md border px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 ${fc("client_address", extracted.client_address.confidence)}`}
              required
            />
          </div>
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
      </div>

      {submitError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{submitError}</p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitPending}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {submitPending ? "Submitting…" : "Submit report request"}
        </button>
        <a href="/portal/submit" className="text-sm text-zinc-500 hover:text-zinc-700">
          Start over
        </a>
      </div>
    </form>
  );
}

// ── Main form component ───────────────────────────────────────────────────────

export function SubmissionForm({ templates, defaultTemplateId, initialState }: Props) {
  const [extractState, extractAction, extractPending] = useActionState<ExtractState, FormData>(
    extractFields,
    initialState ?? { step: 1 }
  );
  const [submitState, submitAction, submitPending] = useActionState(submitProject, {});

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
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        )}

        {!showTemplateDropdown && defaultTemplateId && (
          <input type="hidden" name="template_id" value={defaultTemplateId} />
        )}

        <div>
          <label className="block text-xs font-medium text-zinc-700 mb-1">
            Purchase order (PDF) <span className="text-zinc-400 font-normal">— optional</span>
          </label>
          <div
            className={`flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed px-4 py-8 text-center transition-colors ${
              isDraggingPo
                ? "border-zinc-500 bg-zinc-100"
                : "border-zinc-200 bg-zinc-50 hover:border-zinc-400 hover:bg-zinc-100"
            }`}
            onClick={() => poInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setIsDraggingPo(true); }}
            onDragLeave={() => setIsDraggingPo(false)}
            onDrop={(e) => dropFile(e, poInputRef, setPoFileName, setIsDraggingPo)}
          >
            <input
              ref={poInputRef}
              type="file"
              name="po_file"
              accept="application/pdf"
              className="sr-only"
              onChange={(e) => setPoFileName(e.target.files?.[0]?.name ?? null)}
            />
            {poFileName ? (
              <p className="text-sm font-medium text-zinc-800">{poFileName}</p>
            ) : (
              <>
                <p className="text-sm font-medium text-zinc-600">Click or drag to upload PO document</p>
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
            onDragOver={(e) => { e.preventDefault(); setIsDraggingPlans(true); }}
            onDragLeave={() => setIsDraggingPlans(false)}
            onDrop={(e) => dropFile(e, plansInputRef, setPlansFileName, setIsDraggingPlans)}
          >
            <input
              ref={plansInputRef}
              type="file"
              name="plans_file"
              accept="application/pdf"
              className="sr-only"
              required
              onChange={(e) => setPlansFileName(e.target.files?.[0]?.name ?? null)}
            />
            {plansFileName ? (
              <p className="text-sm font-medium text-zinc-800">{plansFileName}</p>
            ) : (
              <>
                <p className="text-sm font-medium text-zinc-600">Click or drag to upload building plans</p>
                <p className="mt-1 text-xs text-zinc-400">PDF up to 50 MB</p>
              </>
            )}
          </div>
        </div>

        {extractState.error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {extractState.error}
          </p>
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
