import { Suspense } from "react";
import { VerifyForm } from "./_components/verify-form";

export default function Verify2FAPage() {
  return (
    <div className="mt-16">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight text-zinc-900">
        Two-factor authentication
      </h1>
      <p className="mb-8 text-sm text-zinc-500">
        Enter the 6-digit code from your authenticator app.
      </p>
      <Suspense>
        <VerifyForm />
      </Suspense>
    </div>
  );
}
