import { DISCIPLINES, disciplineNameForSuffix } from "@/lib/projects/project-number";

/** Read-only discipline pill for the template header — name, not the document-filename letter. */
export function DisciplinePill({ suffix }: { suffix: string }) {
  const name = disciplineNameForSuffix(suffix);
  return (
    <span
      className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700"
      title={`Documents from this template use -${suffix}`}
    >
      {name ?? DISCIPLINES.find((d) => d.suffix === "S")!.name}
    </span>
  );
}
