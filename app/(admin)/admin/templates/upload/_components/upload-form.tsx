"use client";

import { useActionState } from "react";
import { uploadTemplate, type UploadTemplateState } from "@/app/actions/templates";

interface Props {
  orgs: { id: string; name: string }[];
  defaultOrgId?: string;
}

export function UploadTemplateForm({ orgs, defaultOrgId }: Props) {
  const [state, formAction, pending] = useActionState<UploadTemplateState, FormData>(
    uploadTemplate,
    {}
  );

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-zinc-700">
          Client
        </label>
        <select
          name="client_id"
          defaultValue={defaultOrgId ?? ""}
          required
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
        >
          <option value="" disabled>
            Select an organisation
          </option>
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-zinc-700">
          Template name
        </label>
        <input
          name="name"
          type="text"
          required
          placeholder="e.g. Stockland PBDB v3"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-zinc-700">
          Template file (.docx)
        </label>
        <input
          name="file"
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          required
          className="block w-full text-sm text-zinc-600 file:mr-4 file:rounded file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-zinc-200"
        />
        <p className="mt-1 text-xs text-zinc-400">Max 20 MB. Must contain {"{TOKEN}"} placeholders.</p>
      </div>

      {state.error && (
        <p className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
      >
        {pending ? "Uploading…" : "Upload & extract tokens"}
      </button>
    </form>
  );
}
