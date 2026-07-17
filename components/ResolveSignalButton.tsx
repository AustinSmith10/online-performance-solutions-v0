"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ResolveSignalButton({ signalId }: { signalId: string }) {
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function handleClick() {
    setPending(true);
    const res = await fetch("/api/system-errors/resolve", {
      method: "POST",
      body: JSON.stringify({ signalId }),
    });
    if (res.ok) router.refresh();
    setPending(false);
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
