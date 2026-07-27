"use client";

import { useActionState } from "react";
import { completeProfile, type CompleteProfileState } from "@/app/actions/auth";
import { ProfileFieldsFragment } from "@/components/auth/ProfileFieldsFragment";

export default function CompleteProfilePage() {
  const [state, action, pending] = useActionState<
    CompleteProfileState,
    FormData
  >(completeProfile, {});

  return (
    <div className="mt-16">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight text-zinc-900">
        Complete your profile
      </h1>
      <p className="mb-8 text-sm text-zinc-500">
        A few more details before you can access the portal.
      </p>

      {state.errors?.form?.map((e) => (
        <p
          key={e}
          className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {e}
        </p>
      ))}

      <form action={action} className="space-y-4">
        <ProfileFieldsFragment errors={state.errors} />

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Continue"}
        </button>
      </form>
    </div>
  );
}
