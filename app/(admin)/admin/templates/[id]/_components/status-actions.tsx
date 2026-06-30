"use client";

import { useState, useTransition } from "react";
import {
  activateTemplate,
  deactivateTemplate,
  reactivateTemplate,
} from "@/app/actions/templates";

interface Props {
  templateId: string;
  status: string;
  canActivate: boolean;
}

type PendingAction = "activate" | "deactivate" | "reactivate" | null;

export function TemplateStatusActions({ templateId, status, canActivate }: Props) {
  const [confirm, setConfirm] = useState<PendingAction>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();

  function run(action: PendingAction) {
    if (!action) return;
    setError(undefined);
    startTransition(async () => {
      let result: { error?: string };
      if (action === "activate") result = await activateTemplate(templateId);
      else if (action === "deactivate") result = await deactivateTemplate(templateId);
      else result = await reactivateTemplate(templateId);
      if (result?.error) {
        setError(result.error);
        setConfirm(null);
      }
    });
  }

  const confirmLabel =
    confirm === "activate" ? "Activate template?" :
    confirm === "deactivate" ? "Deactivate template?" :
    "Reactivate template?";

  const confirmBody =
    confirm === "activate"
      ? "This template will be available to use in new projects."
      : confirm === "deactivate"
      ? "This template will no longer appear for new projects. Existing projects are unaffected."
      : "This template will become available to use in new projects again.";

  const confirmBtnLabel =
    confirm === "activate" ? "Activate" :
    confirm === "deactivate" ? "Deactivate" :
    "Reactivate";

  return (
    <div className="flex items-center gap-3">
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/30">
          <div className="mx-4 w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 shadow-xl text-center">
            <p className="text-base font-semibold text-zinc-900">{confirmLabel}</p>
            <p className="mt-2 text-sm text-zinc-500">{confirmBody}</p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirm(null)}
                disabled={isPending}
                className="flex-1 rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => run(confirm)}
                disabled={isPending}
                className="flex-1 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
              >
                {isPending ? `${confirmBtnLabel.replace(/e$/, "")}ing…` : confirmBtnLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {status === "draft" && (
        <button
          type="button"
          onClick={() => setConfirm("activate")}
          disabled={!canActivate}
          title={!canActivate ? "Resolve all red flags first" : undefined}
          className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Activate template
        </button>
      )}

      {status === "active" && (
        <button
          type="button"
          onClick={() => setConfirm("deactivate")}
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Deactivate
        </button>
      )}

      {status === "inactive" && (
        <button
          type="button"
          onClick={() => setConfirm("reactivate")}
          className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
        >
          Reactivate
        </button>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
