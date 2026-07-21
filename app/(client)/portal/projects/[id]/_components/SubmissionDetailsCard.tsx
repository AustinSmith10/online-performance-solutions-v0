"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { updateStakeholderSubmission, type UpdateSubmissionState } from "@/app/actions/projects";
import { EditIconButton } from "@/components/EditIconButton";
import { useUnsavedChanges } from "@/components/UnsavedChangesProvider";
import { FieldFlagReview, type FieldFlagCandidate } from "@/components/field-flag-review";

interface FieldEntry {
  token: string;
  label: string;
  value: string;
}

export interface OpenFieldFlag {
  id: string;
  candidates: FieldFlagCandidate[];
}

interface Props {
  projectId: string;
  poNumber: string | null;
  fieldEntries: FieldEntry[];
  locked: boolean;
  flagsByToken?: Record<string, OpenFieldFlag>;
}

export function SubmissionDetailsCard({ projectId, poNumber, fieldEntries, locked, flagsByToken = {} }: Props) {
  const router = useRouter();
  const boundAction = updateStakeholderSubmission.bind(null, projectId);
  const [state, formAction, pending] = useActionState<UpdateSubmissionState, FormData>(
    boundAction,
    {}
  );
  const [editing, setEditing] = useState(false);
  useUnsavedChanges("submission-details", editing);

  useEffect(() => {
    if (state.success) {
      queueMicrotask(() => setEditing(false));
      router.refresh();
    }
  }, [state.success, router]);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white">
      <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
        <h2 className="text-sm font-semibold text-zinc-900">Submitted details</h2>
        {!locked && !editing && (
          <EditIconButton onClick={() => setEditing(true)} label="Edit submission" />
        )}
      </div>

      {locked && (
        <p className="border-b border-zinc-100 bg-amber-50 px-5 py-2.5 text-xs text-amber-800">
          Under review — editing is no longer available.
        </p>
      )}

      {editing ? (
        <form action={formAction} className="space-y-4 px-5 py-4">
          <div>
            <label htmlFor="po_number" className="block text-xs font-medium text-zinc-500">
              PO number
            </label>
            <input
              id="po_number"
              name="po_number"
              type="text"
              defaultValue={poNumber ?? ""}
              disabled={pending}
              className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-60"
            />
          </div>

          {fieldEntries.map(({ token, label, value }) => (
            <div key={token}>
              <label htmlFor={token} className="block text-xs font-medium text-zinc-500">
                {label}
              </label>
              <input
                id={token}
                name={token}
                type="text"
                defaultValue={value}
                disabled={pending}
                className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-60"
              />
            </div>
          ))}

          {state.error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
          )}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={pending}
              className="text-sm text-zinc-500 hover:text-zinc-700 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="divide-y divide-zinc-100">
          <Row label="PO number" value={poNumber ?? "—"} />
          {fieldEntries.map(({ token, label, value }) => (
            <Row key={token} label={label} value={value || "—"} flag={flagsByToken[token]} />
          ))}
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  flag,
}: {
  label: string;
  value: React.ReactNode;
  flag?: OpenFieldFlag;
}) {
  const [resolvedValue, setResolvedValue] = useState<string | null>(null);
  return (
    <div className="px-5 py-3">
      <div className="flex items-baseline gap-4">
        <span className="w-40 shrink-0 text-sm text-zinc-500">{label}</span>
        <span className="min-w-0 flex-1 text-sm text-zinc-900">{resolvedValue ?? value}</span>
      </div>
      {/* Rendered on its own line, not trailing inline with the value —
          the expanded form needs the full row width, not just the leftover
          space next to the value column. */}
      {flag && !resolvedValue && (
        <div className="mt-1 flex justify-end">
          <FieldFlagReview
            flagId={flag.id}
            label={label}
            currentValue={typeof value === "string" ? value : ""}
            candidates={flag.candidates}
            stakeholderView
            onResolved={(v) => setResolvedValue(v)}
          />
        </div>
      )}
    </div>
  );
}
