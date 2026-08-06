"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { resolveAiProviderFailure } from "@/app/actions/admin-users";

export function ResolveAiProviderFailureButton({ failureId }: { failureId: string }) {
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function handleClick() {
    setPending(true);
    try {
      await resolveAiProviderFailure(failureId);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      onClick={() => void handleClick()}
      disabled={pending}
      className="shrink-0 rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 hover:bg-green-100 disabled:opacity-50"
    >
      {pending ? "Resolving…" : "Mark resolved"}
    </button>
  );
}
