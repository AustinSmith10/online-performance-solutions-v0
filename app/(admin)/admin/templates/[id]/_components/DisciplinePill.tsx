import { DISCIPLINES, disciplineNameForSuffix, type DisciplineSuffix } from "@/lib/projects/project-number";

// One colour per discipline, applied consistently wherever a discipline is
// shown (currently just this pill). Colour is decorative here, not a status
// signal — the discipline name is always shown alongside it too.
const DISCIPLINE_COLORS: Record<DisciplineSuffix, string> = {
  F: "border-red-200 bg-red-100 text-red-700", // Fire
  D: "border-blue-200 bg-blue-100 text-blue-700", // Access
  S: "border-orange-200 bg-orange-100 text-orange-700", // Solutions
  A: "border-green-200 bg-green-100 text-green-700", // Acoustics
  E: "border-sky-200 bg-sky-100 text-sky-700", // ESD
  C: "border-yellow-200 bg-yellow-100 text-yellow-800", // Code
};

/** Read-only discipline pill for the template header — name, not the document-filename letter. */
export function DisciplinePill({ suffix }: { suffix: string }) {
  const name = disciplineNameForSuffix(suffix);
  const colors = DISCIPLINE_COLORS[suffix as DisciplineSuffix] ?? "border-zinc-200 bg-zinc-100 text-zinc-700";
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-xs font-medium ${colors}`}
      title={`Documents from this template use -${suffix}`}
    >
      {name ?? DISCIPLINES.find((d) => d.suffix === "S")!.name}
    </span>
  );
}
