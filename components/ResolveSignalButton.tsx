"use client";

import { useRouter } from "next/navigation";
import { ConfirmResolveButton } from "@/components/ConfirmResolveButton";

export function ResolveSignalButton({ signalId }: { signalId: string }) {
  const router = useRouter();

  return (
    <ConfirmResolveButton
      onResolve={async () => {
        const res = await fetch("/api/system-errors/resolve", {
          method: "POST",
          body: JSON.stringify({ signalId }),
        });
        if (res.ok) router.refresh();
        return res.ok;
      }}
    />
  );
}
