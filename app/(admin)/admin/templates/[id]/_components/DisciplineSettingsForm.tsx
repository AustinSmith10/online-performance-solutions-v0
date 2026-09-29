"use client";

import { useActionState } from "react";
import { updateTemplateNumberSuffix, type UpdateNumberSuffixState } from "@/app/actions/templates";
import { DISCIPLINES } from "@/lib/projects/project-number";
import { DisciplinePill } from "./DisciplinePill";

interface Props {
  templateId: string;
  suffix: string;
}

// Lives in the Settings tab. Changing it only affects documents generated
// from this template from now on — anything already sent keeps the letter
// it was built with.
export function DisciplineSettingsForm({ templateId, suffix }: Props) {
  const [state, formAction, pending] = useActionState<UpdateNumberSuffixState, FormData>(
    updateTemplateNumberSuffix.bind(null, templateId),
    {}
  );

  return (
    <div className="rounded-xl border border-zinc-200 bg-white">
      <div className="border-b border-zinc-100 px-5 py-4">
        <h2 className="text-sm font-semibold text-zinc-900">Discipline</h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          Sets the letter this template appends to the project number in documents and emails (Solutions gives
          250012-S). Only affects reports generated from now on — anything already sent keeps its original letter.
        </p>
      </div>
      <form key={suffix} action={formAction} className="flex flex-wrap items-center gap-3 px-5 py-4">
        <DisciplinePill suffix={suffix} />
        <select
          name="number_suffix"
          defaultValue={suffix}
          required
          disabled={pending}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm focus:border-zinc-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
        >
          {DISCIPLINES.map((d) => (
            <option key={d.suffix} value={d.suffix}>
              {d.name} ({d.suffix})
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="press rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-1 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {state.success && !pending && <span className="rise-in text-xs text-green-700">Saved</span>}
        {state.error && <span className="rise-in text-xs text-red-700">{state.error}</span>}
      </form>
    </div>
  );
}
