"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useActionState } from "react";
import { updateClient, type ClientFormState } from "@/app/actions/clients";
import { OrgFormFields } from "@/app/(admin)/admin/clients/_components/org-form-fields";
import type { Client } from "@/types";

const PAYMENT_LABELS: Record<string, string> = {
  upfront: "Upfront",
  credit_deduction: "Credit deduction",
  deferred: "Deferred",
};

interface Props {
  org: Client;
}

export function OrgDetailReadonly({ org }: Props) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const boundAction = updateClient.bind(null, org.id);
  const [state, action, pending] = useActionState<ClientFormState, FormData>(boundAction, {});

  useEffect(() => { queueMicrotask(() => setMounted(true)); }, []);

  useEffect(() => {
    if (state.saved) queueMicrotask(() => setOpen(false));
  }, [state.saved]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open]);

  const rows: { label: string; value: string | number | null | undefined }[] = [
    { label: "Name", value: org.name },
    { label: "Payment method", value: PAYMENT_LABELS[org.payment_method] ?? org.payment_method },
    { label: "State / territory", value: org.state_territory || "—" },
    { label: "Delivery working days", value: org.delivery_working_days },
    { label: "Abandoned draft days", value: org.abandoned_draft_days },
    { label: "Credit limit (deferred)", value: org.credit_limit?.toLocaleString() ?? "0" },
  ];

  const drawer = (
    <>
      <div
        onClick={() => setOpen(false)}
        aria-hidden="true"
        style={{ opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none" }}
        className="fixed inset-0 z-40 bg-black/20 transition-opacity duration-300"
      />
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          width: "24rem",
          height: "100dvh",
          zIndex: 50,
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 300ms ease-in-out",
        }}
        className="flex flex-col border-l border-zinc-200 bg-white"
      >
        <div className="flex shrink-0 items-start justify-between border-b border-zinc-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-zinc-900">Edit organisation details</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close panel"
            className="ml-3 shrink-0 rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <form action={action} className="space-y-5">
            <OrgFormFields state={state} defaults={org} />
            {state.errors?.form?.map((e) => (
              <p key={e} className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{e}</p>
            ))}
            <div className="pt-2">
              <button
                type="submit"
                disabled={pending}
                className="rounded-md bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
              >
                {pending ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );

  return (
    <>
      <div className="rounded-lg border border-zinc-200 bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-900">Client details</h2>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
          >
            Edit
          </button>
        </div>
        <dl className="divide-y divide-zinc-100">
          {rows.map(({ label, value }) => (
            <div key={label} className="flex items-baseline justify-between py-2.5">
              <dt className="text-sm text-zinc-500">{label}</dt>
              <dd className="text-sm font-medium text-zinc-900">{value ?? "—"}</dd>
            </div>
          ))}
        </dl>
      </div>
      {mounted && createPortal(drawer, document.body)}
    </>
  );
}
