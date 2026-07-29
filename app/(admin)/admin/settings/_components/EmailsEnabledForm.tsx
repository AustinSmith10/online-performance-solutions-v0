"use client";

import { useActionState } from "react";
import {
  updateEmailsEnabledAction,
  type UpdateEmailsEnabledState,
} from "@/app/actions/settings";

export function EmailsEnabledForm({ enabled }: { enabled: boolean }) {
  const [state, action, pending] = useActionState<UpdateEmailsEnabledState, FormData>(
    updateEmailsEnabledAction,
    {}
  );

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-zinc-900">Outbound emails</h2>
      <p className="mt-0.5 text-xs text-zinc-500">
        Turn off to stop all outbound emails from being sent — useful while we&apos;re still on
        Postmark&apos;s free plan and want to avoid burning through the send limit during testing.
        Attempted sends are still logged as failed in the delivery log.
      </p>

      {state.errors?.form?.map((e) => (
        <p key={e} className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {e}
        </p>
      ))}

      {state.saved && (
        <p className="mt-4 text-sm font-medium text-green-700">Email setting updated.</p>
      )}

      <form action={action} className="mt-5 flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={enabled}
            className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500"
          />
          Send outbound emails
        </label>

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
      </form>
    </div>
  );
}
