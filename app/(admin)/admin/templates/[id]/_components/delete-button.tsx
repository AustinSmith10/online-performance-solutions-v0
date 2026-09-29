"use client";

import { useState, useTransition } from "react";
import { deleteTemplate } from "@/app/actions/templates";
import { Drawer } from "@/components/Drawer";

export function DeleteButton({ templateId }: { templateId: string }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(() => {
      deleteTemplate(templateId);
    });
  }

  return (
    <>
      <Drawer
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Delete this template?"
      >
        <p className="text-sm text-zinc-600">
          The template will be moved to the recovery bin and can be restored later. Any projects using this template will be unaffected but the template cannot be reused while deleted.
        </p>
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={isPending}
            className="press-subtle flex-1 rounded-md border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isPending}
            className="press-subtle flex-1 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {isPending ? "Deleting…" : "Delete"}
          </button>
        </div>
      </Drawer>

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="press-subtle rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
      >
        Delete template
      </button>
    </>
  );
}
