import { Suspense } from "react";
import { LoginForm } from "./_components/login-form";

export default function LoginPage() {
  return (
    <div className="mt-16">
      <h1 className="mb-8 text-2xl font-semibold tracking-tight text-zinc-900">
        Sign in to OPS
      </h1>
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
