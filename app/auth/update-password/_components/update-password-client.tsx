"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import {
  completePasswordReset,
  completeOnboarding,
  type CompletePasswordResetState,
  type CompleteOnboardingState,
} from "@/app/actions/auth";
import { ProfileFieldsFragment } from "@/components/auth/ProfileFieldsFragment";

interface Props {
  code?: string;
  tokenHash?: string;
  type?: string;
}

export default function UpdatePasswordClient({ code, tokenHash, type }: Props) {
  const router = useRouter();
  const [sessionStatus, setSessionStatus] = useState<"pending" | "ready" | "invalid">(
    "pending"
  );
  // Whether this session belongs to a brand-new invited user (no profile yet)
  // or an existing user resetting a forgotten password. Determined once the
  // session is established, alongside sessionStatus — a new invited user
  // gets the combined password + profile form in one step instead of a
  // password page followed by a separate "complete your profile" page.
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  const [resetState, resetAction, resetPending] = useActionState<
    CompletePasswordResetState,
    FormData
  >(completePasswordReset, {});

  const [onboardingState, onboardingAction, onboardingPending] = useActionState<
    CompleteOnboardingState,
    FormData
  >(completeOnboarding, {});

  useEffect(() => {
    async function establishSession() {
      const supabase = createClient();

      async function finish(error: unknown) {
        if (error) {
          setSessionStatus("invalid");
          return;
        }
        const { data } = await supabase.auth.getUser();
        setNeedsOnboarding(data.user?.user_metadata?.profile_complete !== true);
        setSessionStatus("ready");
      }

      // PKCE flow — ?code=xxx
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        await finish(error);
        return;
      }

      // OTP flow — ?token_hash=xxx&type=xxx
      if (tokenHash && type) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type as EmailOtpType,
        });
        await finish(error);
        return;
      }

      // Implicit flow — tokens arrive in URL fragment (#access_token=xxx&refresh_token=xxx)
      const hash = window.location.hash.substring(1);
      if (hash) {
        const params = new URLSearchParams(hash);
        if (params.get("error")) {
          setSessionStatus("invalid");
          return;
        }

        const access_token = params.get("access_token");
        const refresh_token = params.get("refresh_token");
        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({ access_token, refresh_token });
          await finish(error);
          return;
        }
      }

      setSessionStatus("invalid");
    }

    establishSession();
  }, [code, tokenHash, type]);

  useEffect(() => {
    if (resetState.success) {
      const timeout = setTimeout(() => router.push("/login"), 1500);
      return () => clearTimeout(timeout);
    }
  }, [resetState.success, router]);

  if (sessionStatus === "pending") {
    return <p className="text-sm text-zinc-500">Verifying link…</p>;
  }

  if (sessionStatus === "invalid") {
    return (
      <div>
        <h1 className="mb-8 text-2xl font-semibold tracking-tight text-zinc-900">
          Set a new password
        </h1>
        <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          This link is invalid or has expired.
        </p>
        <a
          href="/forgot-password"
          className="mt-4 inline-block text-sm font-medium text-zinc-700 underline hover:text-zinc-900"
        >
          Request a new link
        </a>
      </div>
    );
  }

  if (resetState.success) {
    return (
      <div>
        <h1 className="mb-8 text-2xl font-semibold tracking-tight text-zinc-900">
          Set a new password
        </h1>
        <p className="rounded-md bg-green-50 px-4 py-3 text-sm text-green-700">
          Password updated. Redirecting to sign in…
        </p>
      </div>
    );
  }

  if (needsOnboarding) {
    return (
      <div>
        <h1 className="mb-2 text-2xl font-semibold tracking-tight text-zinc-900">
          Set up your account
        </h1>
        <p className="mb-8 text-sm text-zinc-500">
          Choose a password and add a few details before you get started.
        </p>

        <form action={onboardingAction} className="space-y-4">
          {onboardingState.errors?.form?.map((e) => (
            <p key={e} className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
              {e}
            </p>
          ))}

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-zinc-700">
              Set a password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            />
            <p className="mt-1 text-xs text-zinc-400">
              12+ characters, with uppercase, number, and special character.
            </p>
            {onboardingState.errors?.password?.map((e) => (
              <p key={e} className="mt-1 text-xs text-red-600">
                {e}
              </p>
            ))}
          </div>

          <div>
            <label htmlFor="confirm_password" className="block text-sm font-medium text-zinc-700">
              Confirm password
            </label>
            <input
              id="confirm_password"
              name="confirm_password"
              type="password"
              autoComplete="new-password"
              required
              className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            />
            {onboardingState.errors?.confirm_password?.map((e) => (
              <p key={e} className="mt-1 text-xs text-red-600">
                {e}
              </p>
            ))}
          </div>

          <hr className="border-zinc-200" />

          <ProfileFieldsFragment errors={onboardingState.errors} />

          <button
            type="submit"
            disabled={onboardingPending}
            className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            {onboardingPending ? "Saving…" : "Continue"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-8 text-2xl font-semibold tracking-tight text-zinc-900">
        Set a new password
      </h1>
      <form action={resetAction} className="space-y-4">
        {resetState.errors?.form?.map((e) => (
          <p key={e} className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
            {e}
          </p>
        ))}

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-zinc-700">
            New password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          />
          {resetState.errors?.password?.map((e) => (
            <p key={e} className="mt-1 text-xs text-red-600">
              {e}
            </p>
          ))}
        </div>

        <div>
          <label
            htmlFor="confirm_password"
            className="block text-sm font-medium text-zinc-700"
          >
            Confirm password
          </label>
          <input
            id="confirm_password"
            name="confirm_password"
            type="password"
            autoComplete="new-password"
            required
            className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          />
          {resetState.errors?.confirm_password?.map((e) => (
            <p key={e} className="mt-1 text-xs text-red-600">
              {e}
            </p>
          ))}
        </div>

        <button
          type="submit"
          disabled={resetPending}
          className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {resetPending ? "Updating…" : "Update password"}
        </button>
      </form>
    </div>
  );
}
