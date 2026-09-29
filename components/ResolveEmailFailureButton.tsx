"use client";

import { useRouter } from "next/navigation";
import { resolveEmailFailure } from "@/app/actions/admin-users";
import { ConfirmResolveButton } from "@/components/ConfirmResolveButton";

export function ResolveEmailFailureButton({ failureId }: { failureId: string }) {
  const router = useRouter();

  return (
    <ConfirmResolveButton
      onResolve={async () => {
        await resolveEmailFailure(failureId);
        router.refresh();
        return true;
      }}
    />
  );
}
