import { ForgotPasswordForm } from "./_components/forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <div className="mt-16">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight text-zinc-900">
        Reset your password
      </h1>
      <p className="mb-8 text-sm text-zinc-500">
        Enter your email and we&apos;ll send you a link to reset your password.
      </p>
      <ForgotPasswordForm />
    </div>
  );
}
