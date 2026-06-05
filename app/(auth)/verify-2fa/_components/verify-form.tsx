"use client";

import { useActionState } from "react";
import { verifyTotp, type VerifyTotpState } from "@/app/actions/auth";
import { useSearchParams } from "next/navigation";

export function VerifyForm() {
  const [state, action, pending] = useActionState<VerifyTotpState, FormData>(
    verifyTotp,
    {}
  );
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "";

  return (
    <>
      {state.errors?.form?.map((e) => (
        <p
          key={e}
          className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {e}
        </p>
      ))}

      <form action={action} className="space-y-4">
        <input type="hidden" name="next" value={next} />

        <div>
          <label
            htmlFor="code"
            className="block text-sm font-medium text-zinc-700"
          >
            Authentication code
          </label>
          <input
            id="code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            required
            className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-center text-xl tracking-widest shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          />
          {state.errors?.code?.map((e) => (
            <p key={e} className="mt-1 text-xs text-red-600">
              {e}
            </p>
          ))}
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {pending ? "Verifying…" : "Verify"}
        </button>
      </form>
    </>
  );
}
