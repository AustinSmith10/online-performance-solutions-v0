"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import {
  completePasswordReset,
  type CompletePasswordResetState,
} from "@/app/actions/auth";

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
  const [state, action, pending] = useActionState<CompletePasswordResetState, FormData>(
    completePasswordReset,
    {}
  );

  useEffect(() => {
    async function establishSession() {
      const supabase = createClient();

      // PKCE flow — ?code=xxx
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        setSessionStatus(error ? "invalid" : "ready");
        return;
      }

      // OTP flow — ?token_hash=xxx&type=xxx
      if (tokenHash && type) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type as EmailOtpType,
        });
        setSessionStatus(error ? "invalid" : "ready");
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
          setSessionStatus(error ? "invalid" : "ready");
          return;
        }
      }

      setSessionStatus("invalid");
    }

    establishSession();
  }, [code, tokenHash, type]);

  useEffect(() => {
    if (state.success) {
      const timeout = setTimeout(() => router.push("/login"), 1500);
      return () => clearTimeout(timeout);
    }
  }, [state.success, router]);

  if (sessionStatus === "pending") {
    return <p className="text-sm text-zinc-500">Verifying link…</p>;
  }

  if (sessionStatus === "invalid") {
    return (
      <div>
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

  if (state.success) {
    return (
      <p className="rounded-md bg-green-50 px-4 py-3 text-sm text-green-700">
        Password updated. Redirecting to sign in…
      </p>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {state.errors?.form?.map((e) => (
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
        {state.errors?.password?.map((e) => (
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
        {state.errors?.confirm_password?.map((e) => (
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
        {pending ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}
