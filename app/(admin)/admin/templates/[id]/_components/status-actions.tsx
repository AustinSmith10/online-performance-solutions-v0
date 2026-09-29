"use client";

import { useState, useTransition } from "react";
import {
  activateTemplate,
  deactivateTemplate,
  reactivateTemplate,
} from "@/app/actions/templates";
import { Drawer } from "@/components/Drawer";

interface Props {
  templateId: string;
  status: string;
  canActivate: boolean;
}

type PendingAction = "activate" | "deactivate" | "reactivate" | null;

export function TemplateStatusActions({ templateId, status, canActivate }: Props) {
  const [confirm, setConfirm] = useState<PendingAction>(null);
  const [open, setOpen] = useState(false);

  function ask(action: PendingAction) {
    setConfirm(action);
    setOpen(true);
  }
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
        setOpen(false);
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
      <Drawer
        isOpen={open}
        onClose={() => setOpen(false)}
        title={confirmLabel}
      >
        <p className="text-sm text-zinc-600">{confirmBody}</p>
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={isPending}
            className="press-subtle flex-1 rounded-md border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => run(confirm)}
            disabled={isPending}
            className="press-subtle flex-1 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            {isPending ? `${confirmBtnLabel.replace(/e$/, "")}ing…` : confirmBtnLabel}
          </button>
        </div>
      </Drawer>

      {status === "draft" && (
        <button
          type="button"
          onClick={() => ask("activate")}
          disabled={!canActivate}
          title={!canActivate ? "Resolve all red flags first" : undefined}
          className="press-subtle rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Activate template
        </button>
      )}

      {status === "active" && (
        <button
          type="button"
          onClick={() => ask("deactivate")}
          className="press-subtle rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Deactivate
        </button>
      )}

      {status === "inactive" && (
        <button
          type="button"
          onClick={() => ask("reactivate")}
          className="press-subtle rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
        >
          Reactivate
        </button>
      )}

      {error && <p className="rise-in text-sm text-red-600">{error}</p>}
    </div>
  );
}
