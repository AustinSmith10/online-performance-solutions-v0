"use client";

import { useActionState } from "react";
import {
  activateTemplate,
  deactivateTemplate,
  reactivateTemplate,
  type ActivateTemplateState,
  type DeactivateTemplateState,
} from "@/app/actions/templates";

interface Props {
  templateId: string;
  status: string;
  canActivate: boolean;
}

export function TemplateStatusActions({ templateId, status, canActivate }: Props) {
  const activate = activateTemplate.bind(null, templateId);
  const deactivate = deactivateTemplate.bind(null, templateId);
  const reactivate = reactivateTemplate.bind(null, templateId);

  const [activateState, activateAction, activatePending] = useActionState<
    ActivateTemplateState,
    FormData
  >(async (_prev, _fd) => activate(), {});

  const [deactivateState, deactivateAction, deactivatePending] = useActionState<
    DeactivateTemplateState,
    FormData
  >(async (_prev, _fd) => deactivate(), {});

  const [reactivateState, reactivateAction, reactivatePending] = useActionState<
    DeactivateTemplateState,
    FormData
  >(async (_prev, _fd) => reactivate(), {});

  const error =
    activateState?.error ?? deactivateState?.error ?? reactivateState?.error;

  return (
    <div className="flex items-center gap-3">
      {status === "draft" && (
        <form action={activateAction}>
          <button
            type="submit"
            disabled={!canActivate || activatePending}
            title={!canActivate ? "Resolve all red flags first" : undefined}
            className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {activatePending ? "Activating…" : "Activate template"}
          </button>
        </form>
      )}

      {status === "active" && (
        <form action={deactivateAction}>
          <button
            type="submit"
            disabled={deactivatePending}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            {deactivatePending ? "Deactivating…" : "Deactivate"}
          </button>
        </form>
      )}

      {status === "inactive" && (
        <form action={reactivateAction}>
          <button
            type="submit"
            disabled={reactivatePending}
            className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {reactivatePending ? "Reactivating…" : "Reactivate"}
          </button>
        </form>
      )}

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}
