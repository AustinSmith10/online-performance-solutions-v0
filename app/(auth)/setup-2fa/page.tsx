"use client";

import { useEffect, useState, useActionState } from "react";
import { createClient } from "@/lib/supabase/client";
import { confirmTotpEnrollment, type ConfirmTotpState } from "@/app/actions/auth";

type EnrollData = {
  factorId: string;
  qrCode: string;
  secret: string;
};

export default function Setup2FAPage() {
  const [enrollData, setEnrollData] = useState<EnrollData | null>(null);
  const [enrollError, setEnrollError] = useState<string | null>(null);

  const [state, action, pending] = useActionState<ConfirmTotpState, FormData>(
    confirmTotpEnrollment,
    {}
  );

  useEffect(() => {
    async function enroll() {
      const supabase = createClient();
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        issuer: "OPS",
      });
      if (error || !data) {
        setEnrollError(error?.message ?? "Failed to start 2FA setup.");
        return;
      }
      setEnrollData({
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
      });
    }
    enroll();
  }, []);

  return (
    <div className="mt-16">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight text-zinc-900">
        Set up two-factor authentication
      </h1>
      <p className="mb-8 text-sm text-zinc-500">
        Scan the QR code with your authenticator app, then enter the 6-digit
        code to confirm setup.
      </p>

      {enrollError && (
        <p className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {enrollError}
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

      {!enrollData && !enrollError && (
        <p className="text-sm text-zinc-400">Loading QR code…</p>
      )}

      {enrollData && (
        <div className="space-y-6">
          <div className="flex justify-center">
            {/* qr_code is a data: URI (SVG or PNG) from Supabase */}
            <img
              src={enrollData.qrCode}
              alt="TOTP QR code"
              className="h-48 w-48"
            />
          </div>

          <details className="text-sm">
            <summary className="cursor-pointer text-zinc-500">
              Can&apos;t scan? Enter key manually
            </summary>
            <p className="mt-2 break-all rounded-md bg-zinc-100 px-3 py-2 font-mono text-xs text-zinc-700">
              {enrollData.secret}
            </p>
          </details>

          <form action={action} className="space-y-4">
            <input type="hidden" name="factor_id" value={enrollData.factorId} />

            <div>
              <label
                htmlFor="code"
                className="block text-sm font-medium text-zinc-700"
              >
                Verification code
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
              {pending ? "Confirming…" : "Confirm and enable 2FA"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
