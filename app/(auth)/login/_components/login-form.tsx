"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/app/actions/auth";
import { useSearchParams } from "next/navigation";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    login,
    {}
  );
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "";
  const urlError = searchParams.get("error");

  return (
    <>
      {urlError === "invalid-link" && (
        <p className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          Invite link is invalid or has expired. Please request a new invite.
        </p>
      )}

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

        <div>
          <div className="flex items-center justify-between">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-zinc-700"
            >
              Password
            </label>
            <a
              href="/forgot-password"
              className="text-xs text-zinc-500 underline hover:text-zinc-700"
            >
              Forgot password?
            </a>
          </div>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          />
          {state.errors?.password?.map((e) => (
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
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </>
  );
}
