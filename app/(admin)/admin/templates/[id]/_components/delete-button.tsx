"use client";

import { useTransition } from "react";
import { deleteTemplate } from "@/app/actions/templates";

export function DeleteButton({ templateId }: { templateId: string }) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!confirm("Delete this template? This cannot be undone.")) return;
    startTransition(() => {
      deleteTemplate(templateId);
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
    >
      {isPending ? "Deleting…" : "Delete template"}
    </button>
  );
}
