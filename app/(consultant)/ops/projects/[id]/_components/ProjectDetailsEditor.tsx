"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { updateProjectDetails, type UpdateProjectDetailsState } from "@/app/actions/projects";
import { EditIconButton } from "@/components/EditIconButton";
import { CollapsibleSection } from "./CollapsibleSection";

interface FieldEntry {
  token: string;
  label: string;
  value: string;
}

interface Props {
  projectId: string;
  poNumber: string | null;
  fieldEntries: FieldEntry[];
  orgEntries: FieldEntry[];
}

export function ProjectDetailsEditor({
  projectId,
  poNumber,
  fieldEntries,
  orgEntries,
}: Props) {
  return (
    <>
      {/* Project number lives in the "Set project number" step card, not here —
          it gates PBDB generation so it keeps its own dedicated editor. */}
      <CollapsibleSection title="Submitted details" defaultOpen>
        <div className="divide-y divide-zinc-100">
          <EditableRow projectId={projectId} id="po_number" label="PO number" value={poNumber ?? ""} />
          {fieldEntries.map(({ token, label, value }) => (
            <EditableRow key={token} projectId={projectId} id={token} label={label} value={value} />
          ))}
        </div>
      </CollapsibleSection>

      {orgEntries.length > 0 && (
        <CollapsibleSection title="Client values" defaultOpen={false}>
          <p className="px-5 pb-3 pt-4 text-xs text-zinc-500">
            Changes here apply to this project only — the client&apos;s organisation-wide values
            are not affected.
          </p>
          <div className="divide-y divide-zinc-100 border-t border-zinc-100">
            {orgEntries.map(({ token, label, value }) => (
              <EditableRow key={token} projectId={projectId} id={token} label={label} value={value} />
            ))}
          </div>
        </CollapsibleSection>
      )}
    </>
  );
}

function EditableRow({
  projectId,
  id,
  label,
  value,
}: {
  projectId: string;
  id: string;
  label: string;
  value: string;
}) {
  const router = useRouter();
  const boundAction = updateProjectDetails.bind(null, projectId);
  const [state, formAction, pending] = useActionState<UpdateProjectDetailsState, FormData>(
    boundAction,
    {}
  );
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (state.success) {
      queueMicrotask(() => setEditing(false));
      router.refresh();
    }
  }, [state.success, router]);

  if (!editing) {
    return (
      <div className="group flex items-center gap-4 px-5 py-3">
        <span className="w-36 shrink-0 text-sm text-zinc-500">{label}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-zinc-900">{value || "—"}</span>
        <EditIconButton
          onClick={() => setEditing(true)}
          label={`Edit ${label}`}
          className="text-zinc-300 opacity-0 hover:text-zinc-600 group-hover:opacity-100"
        />
      </div>
    );
  }

  return (
    <form action={formAction} className="flex items-center gap-3 px-5 py-2.5">
      <label htmlFor={id} className="w-36 shrink-0 text-sm text-zinc-500">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type="text"
        defaultValue={value}
        disabled={pending}
        autoFocus
        className="min-w-0 flex-1 rounded-md border border-zinc-300 px-2.5 py-1 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-60"
      />
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="submit"
          disabled={pending}
          aria-label="Save"
          className="text-green-600 hover:text-green-700 disabled:opacity-50"
        >
          <CheckIcon />
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={pending}
          aria-label="Cancel"
          className="text-zinc-400 hover:text-zinc-600 disabled:opacity-50"
        >
          <XIcon />
        </button>
      </div>
      {state.error && <span className="shrink-0 text-xs text-red-600">{state.error}</span>}
    </form>
  );
}

function CheckIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
    </svg>
  );
}
