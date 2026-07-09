"use client";

import { useActionState } from "react";
import { requestPasswordReset, type ForgotPasswordState } from "@/app/actions/auth";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState<ForgotPasswordState, FormData>(
    requestPasswordReset,
    {}
  );

  if (state.message) {
    return (
      <div>
        <p className="rounded-md bg-green-50 px-4 py-3 text-sm text-green-700">
          {state.message}
        </p>
        <a
          href="/login"
          className="mt-4 inline-block text-sm font-medium text-zinc-700 underline hover:text-zinc-900"
        >
          Back to sign in
        </a>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {state.errors?.form?.map((e) => (
        <p
          key={e}
          className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {e}
        </p>
      ))}

      <div>
        <label
          htmlFor="email"
          className="block text-sm font-medium text-zinc-700"
        >
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
        />
        {state.errors?.email?.map((e) => (
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
        {pending ? "Sending…" : "Send reset link"}
      </button>

      <a
        href="/login"
        className="block text-center text-sm text-zinc-500 underline hover:text-zinc-700"
      >
        Back to sign in
      </a>
    </form>
  );
}
