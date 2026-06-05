"use client";

import { useActionState } from "react";
import { createOrganisation, type OrgFormState } from "@/app/actions/organisations";
import { OrgFormFields } from "@/app/(admin)/admin/organisations/_components/org-form-fields";

export function CreateOrgForm() {
  const [state, action, pending] = useActionState<OrgFormState, FormData>(
    createOrganisation,
    {}
  );

  return (
    <form action={action} className="space-y-5">
      <OrgFormFields state={state} />

      {state.errors?.form?.map((e) => (
        <p key={e} className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {e}
        </p>
      ))}

      <div className="pt-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create organisation"}
        </button>
      </div>
    </form>
  );
}
