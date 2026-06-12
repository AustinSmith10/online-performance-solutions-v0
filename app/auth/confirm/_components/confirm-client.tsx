"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

interface Props {
  next: string;
  code?: string;
  tokenHash?: string;
  type?: string;
}

export default function ConfirmClient({ next, code, tokenHash, type }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState("Confirming invite…");

  useEffect(() => {
    async function confirm() {
      const supabase = createClient();

      // PKCE flow — ?code=xxx
      if (code) {
        console.log("[auth/confirm] attempting PKCE exchange");
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) { router.push(next); return; }
        console.error("[auth/confirm] PKCE exchange failed:", error.message);
        router.push("/login?error=invalid-link");
        return;
      }

      // OTP flow — ?token_hash=xxx&type=xxx
      if (tokenHash && type) {
        console.log("[auth/confirm] attempting OTP verify");
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type as EmailOtpType,
        });
        if (!error) { router.push(next); return; }
        console.error("[auth/confirm] OTP verify failed:", error.message);
        router.push("/login?error=invalid-link");
        return;
      }

      // Implicit flow — tokens arrive in URL fragment (#access_token=xxx&refresh_token=xxx)
      const rawHash = window.location.hash;
      console.log("[auth/confirm] full URL:", window.location.href);
      console.log("[auth/confirm] raw hash:", rawHash || "(empty)");

      const hash = rawHash.substring(1);
      if (hash) {
        const params = new URLSearchParams(hash);
        console.log("[auth/confirm] hash params:", Object.fromEntries(params.entries()));

        // Supabase sometimes returns an error in the hash
        const hashError = params.get("error");
        if (hashError) {
          console.error("[auth/confirm] Supabase error in hash:", hashError, params.get("error_description"));
          router.push("/login?error=invalid-link");
          return;
        }

        const access_token = params.get("access_token");
        const refresh_token = params.get("refresh_token");

        if (access_token && refresh_token) {
          console.log("[auth/confirm] attempting implicit setSession");
          const { error } = await supabase.auth.setSession({ access_token, refresh_token });
          if (!error) { router.push(next); return; }
          console.error("[auth/confirm] setSession failed:", error.message);
        } else {
          console.log("[auth/confirm] hash has no access_token or refresh_token");
        }
      }

      setStatus("Invalid link");
      router.push("/login?error=invalid-link");
    }

    confirm();
  }, [code, tokenHash, type, next, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-sm text-gray-500">{status}</p>
    </div>
  );
}
