"use client";

import { useActionState } from "react";
import {
  resendStakeholderStatusUpdate,
  type BufferUpdateState,
} from "@/app/actions/stakeholders";

export function ResendBufferUpdateButton({ projectId }: { projectId: string }) {
  const boundAction = resendStakeholderStatusUpdate.bind(null, projectId);
  const [state, formAction, pending] = useActionState<BufferUpdateState, FormData>(
    boundAction,
    {}
  );

  if (state.sent) {
    return (
      <p className="text-xs text-green-700">
        Status update sent to all stakeholders ({state.responded} of {state.total} responded so far).
      </p>
    );
  }

  return (
    <form action={formAction}>
      {state.error && <p className="mb-1 text-xs text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
      >
        {pending ? "Sending…" : "Resend status update to all stakeholders"}
      </button>
    </form>
  );
}
