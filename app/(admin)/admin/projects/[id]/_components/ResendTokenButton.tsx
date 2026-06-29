"use client";

import { useActionState, useEffect } from "react";
import { resendFreshToken, type ResendTokenState } from "@/app/actions/stakeholders";

interface Props {
  reviewId: string;
  projectId: string;
  onSent?: () => void;
}

export function ResendTokenButton({ reviewId, projectId, onSent }: Props) {
  const boundAction = resendFreshToken.bind(null, reviewId, projectId);
  const [state, formAction, pending] = useActionState<ResendTokenState, FormData>(
    boundAction,
    {}
  );

  useEffect(() => {
    if (state.sent) onSent?.();
  }, [state.sent]); // eslint-disable-line react-hooks/exhaustive-deps

  if (state.sent) {
    return <p className="text-xs text-green-700">Link resent.</p>;
  }

  return (
    <form action={formAction} className="mt-2">
      {state.error && <p className="mb-1 text-xs text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
      >
        {pending ? "Sending…" : "Resend link"}
      </button>
    </form>
  );
}
