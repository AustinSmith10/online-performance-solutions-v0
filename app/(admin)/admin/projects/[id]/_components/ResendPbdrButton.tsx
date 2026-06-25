"use client";

import { useActionState } from "react";
import { resendPbdrEmail, type ResendPbdrEmailState } from "@/app/actions/conversion";

export function ResendPbdrButton({ projectId }: { projectId: string }) {
  const boundAction = resendPbdrEmail.bind(null, projectId);
  const [state, formAction, pending] = useActionState<ResendPbdrEmailState, FormData>(
    boundAction,
    {}
  );

  if (state.sent) {
    return <p className="text-xs text-green-700">Delivery email resent.</p>;
  }

  return (
    <form action={formAction}>
      {state.error && <p className="mb-2 text-xs text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
      >
        {pending ? "Sending…" : "Resend delivery email"}
      </button>
    </form>
  );
}
