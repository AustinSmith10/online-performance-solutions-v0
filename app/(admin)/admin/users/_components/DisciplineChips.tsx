import { disciplineNameForSuffix } from "@/lib/projects/project-number";

// Neutral pills naming the report disciplines a user works on. `disciplines`
// holds the suffix letters stored on the user (F, S, D, A, E, C).
export function DisciplineChips({ disciplines, className = "" }: { disciplines: string[] | null | undefined; className?: string }) {
  const names = (disciplines ?? [])
    .map((s) => disciplineNameForSuffix(s))
    .filter((n): n is string => !!n);
  if (names.length === 0) return null;
  return (
    <span className={`inline-flex flex-wrap items-center gap-1 ${className}`}>
      {names.map((n) => (
        <span
          key={n}
          className="whitespace-nowrap rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700"
        >
          {n}
        </span>
      ))}
    </span>
  );
}
