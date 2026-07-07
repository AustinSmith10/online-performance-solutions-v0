"use client";

import { useState, useEffect } from "react";
import { useActionState } from "react";
import { updateClient, type ClientFormState } from "@/app/actions/clients";
import { EditIconButton } from "@/components/EditIconButton";
import { useUnsavedChanges } from "@/components/UnsavedChangesProvider";
import type { Client } from "@/types";

const AU_STATES = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"];

const PAYMENT_LABELS: Record<string, string> = {
  upfront: "Upfront",
  credit_deduction: "Credit deduction",
  deferred: "Deferred",
};

type FieldKey =
  | "name"
  | "payment_method"
  | "state_territory"
  | "delivery_working_days"
  | "abandoned_draft_days"
  | "credit_limit";

type FieldDef =
  | { key: FieldKey; label: string; kind: "text" }
  | { key: FieldKey; label: string; kind: "number"; min?: number; max?: number }
  | { key: FieldKey; label: string; kind: "select"; options: { value: string; label: string }[] };

const FIELDS: FieldDef[] = [
  { key: "name", label: "Name", kind: "text" },
  {
    key: "payment_method",
    label: "Payment method",
    kind: "select",
    options: [
      { value: "upfront", label: "Upfront" },
      { value: "credit_deduction", label: "Credit deduction" },
      { value: "deferred", label: "Deferred" },
    ],
  },
  {
    key: "state_territory",
    label: "State / territory",
    kind: "select",
    options: AU_STATES.map((s) => ({ value: s, label: s })),
  },
  { key: "delivery_working_days", label: "Delivery working days", kind: "number", min: 1, max: 30 },
  { key: "abandoned_draft_days", label: "Abandoned draft days", kind: "number", min: 1, max: 90 },
  { key: "credit_limit", label: "Credit limit (deferred)", kind: "number", min: 0 },
];

function displayValue(org: Client, field: FieldDef): string {
  if (field.key === "payment_method") return PAYMENT_LABELS[org.payment_method] ?? org.payment_method;
  if (field.key === "credit_limit") return org.credit_limit?.toLocaleString() ?? "0";
  const raw = org[field.key];
  return raw !== null && raw !== undefined && raw !== "" ? String(raw) : "—";
}

interface Props {
  org: Client;
}

export function OrgDetailReadonly({ org }: Props) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-6">
      <h2 className="mb-4 text-sm font-semibold text-zinc-900">Client details</h2>
      <dl className="divide-y divide-zinc-100">
        {FIELDS.map((field) => (
          <EditableRow key={field.key} org={org} field={field} />
        ))}
      </dl>
    </div>
  );
}

function EditableRow({ org, field }: { org: Client; field: FieldDef }) {
  const boundAction = updateClient.bind(null, org.id);
  const [state, formAction, pending] = useActionState<ClientFormState, FormData>(boundAction, {});
  const [editing, setEditing] = useState(false);
  useUnsavedChanges(`org-detail-${field.key}`, editing);

  useEffect(() => {
    if (state.saved) queueMicrotask(() => setEditing(false));
  }, [state.saved]);

  const errors = state.errors?.[field.key];

  if (!editing) {
    return (
      <div className="group flex items-baseline justify-between gap-4 py-2.5">
        <dt className="text-sm text-zinc-500">{field.label}</dt>
        <div className="flex items-center gap-2">
          <dd className="text-sm font-medium text-zinc-900">{displayValue(org, field)}</dd>
          <EditIconButton
            onClick={() => setEditing(true)}
            label={`Edit ${field.label}`}
            className="text-zinc-300 opacity-0 hover:text-zinc-600 group-hover:opacity-100"
          />
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex items-center gap-3 py-2.5">
      <label className="w-44 shrink-0 text-sm text-zinc-500">{field.label}</label>
      <div className="min-w-0 flex-1">
        {field.kind === "select" ? (
          <select
            name={field.key}
            defaultValue={String(org[field.key] ?? "")}
            disabled={pending}
            autoFocus
            className={inputClass}
          >
            {field.options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        ) : (
          <input
            name={field.key}
            type={field.kind === "number" ? "number" : "text"}
            min={field.kind === "number" ? field.min : undefined}
            max={field.kind === "number" ? field.max : undefined}
            defaultValue={String(org[field.key] ?? "")}
            disabled={pending}
            autoFocus
            className={inputClass}
          />
        )}
        {errors?.map((e) => (
          <p key={e} className="mt-1 text-xs text-red-600">{e}</p>
        ))}
      </div>
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
    </form>
  );
}

const inputClass =
  "min-w-0 w-full rounded-md border border-zinc-300 px-2.5 py-1 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-60";

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
