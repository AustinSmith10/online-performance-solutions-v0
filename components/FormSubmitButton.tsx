"use client";

import { useFormStatus } from "react-dom";

// A submit button for plain server-action forms (no useActionState in scope):
// it reads the enclosing form's status, so it disables itself and swaps its
// label while the action runs instead of letting a second click through.
export function FormSubmitButton({
  children,
  pendingLabel,
  className = "",
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={`${className} disabled:opacity-50`}>
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
