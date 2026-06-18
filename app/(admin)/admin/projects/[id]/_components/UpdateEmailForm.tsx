"use client";

import { useActionState } from "react";
import { updateStakeholderEmail, type UpdateEmailState } from "@/app/actions/stakeholders";

interface Props {
  reviewId: string;
  projectId: string;
  currentEmail: string;
}

export function UpdateEmailForm({ reviewId, projectId, currentEmail }: Props) {
  const boundAction = updateStakeholderEmail.bind(null, reviewId, projectId);
  const [state, formAction, pending] = useActionState<UpdateEmailState, FormData>(
    boundAction,
    {}
  );

  if (state.saved) {
    return <p className="text-xs text-green-700">Email updated and link resent.</p>;
  }

  return (
    <form action={formAction} className="mt-2 flex items-center gap-2">
      <input
        name="email"
        type="email"
        required
        defaultValue={currentEmail}
        className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs focus:border-zinc-500 focus:outline-none"
      />
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="shrink-0 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Update email & resend"}
      </button>
    </form>
  );
}
