"use client";

import { useRouter } from "next/navigation";
import { resolveAiProviderFailure } from "@/app/actions/admin-users";
import { ConfirmResolveButton } from "@/components/ConfirmResolveButton";

export function ResolveAiProviderFailureButton({ failureId }: { failureId: string }) {
  const router = useRouter();

  return (
    <ConfirmResolveButton
      onResolve={async () => {
        await resolveAiProviderFailure(failureId);
        router.refresh();
        return true;
      }}
    />
  );
}
