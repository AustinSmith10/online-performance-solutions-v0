"use client";

import { useActionState, useState, useEffect, useRef } from "react";
import { Drawer } from "@/components/Drawer";
import { createClient, type ClientFormState } from "@/app/actions/clients";
import { OrgFormFields } from "./org-form-fields";

export function CreateOrgModal() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ClientFormState, FormData>(
    createClient,
    {}
  );

  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => firstFieldRef.current?.focus(), 50);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
      >
        + New organisation
      </button>

      <Drawer isOpen={open} onClose={() => setOpen(false)} title="New organisation">
        <form action={action} className="space-y-4">
          <OrgFormFields state={state} firstFieldRef={firstFieldRef} />

          {state.errors?.form?.map((e) => (
            <p key={e} className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{e}</p>
          ))}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={pending}
              className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
            >
              {pending ? "Creating…" : "Create organisation"}
            </button>
          </div>
        </form>
      </Drawer>
    </>
  );
}
