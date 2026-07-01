"use client";

import { useActionState } from "react";
import { updateClient, type ClientFormState } from "@/app/actions/clients";
import { OrgFormFields } from "@/app/(admin)/admin/clients/_components/org-form-fields";
import type { Client } from "@/types";

export function EditOrgForm({ org }: { org: Client }) {
  const boundAction = updateClient.bind(null, org.id);
  const [state, action, pending] = useActionState<ClientFormState, FormData>(
    boundAction,
    {}
  );

  return (
    <form action={action} className="space-y-5">
      <OrgFormFields state={state} defaults={org} />

      {state.errors?.form?.map((e) => (
        <p key={e} className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {e}
        </p>
      ))}

      {state.saved && (
        <p className="text-sm text-green-600">Saved.</p>
      )}

      <div className="pt-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
