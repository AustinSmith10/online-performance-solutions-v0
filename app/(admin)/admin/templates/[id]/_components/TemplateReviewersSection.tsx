import Link from "next/link";
import { addTemplateStakeholder, removeTemplateStakeholder } from "@/app/actions/template-stakeholders";

interface RosterRow {
  id: string;
  name: string;
  email: string;
  company: string | null;
}

interface Props {
  templateId: string;
  orgId: string;
  roster: RosterRow[];
  requiredIds: Set<string>;
}

export function TemplateReviewersSection({ templateId, orgId, roster, requiredIds }: Props) {
  if (roster.length === 0) {
    return (
      <p className="px-5 py-8 text-center text-sm text-zinc-500">
        This client has no reviewer roster yet.{" "}
        <Link href={`/admin/clients/${orgId}`} className="font-medium text-zinc-900 hover:underline">
          Add third-party stakeholders on their profile
        </Link>{" "}
        to require them here.
      </p>
    );
  }

  return (
    <div className="divide-y divide-zinc-50">
      {roster.map((s) => {
        const required = requiredIds.has(s.id);
        const action = required
          ? removeTemplateStakeholder.bind(null, templateId, s.id)
          : addTemplateStakeholder.bind(null, templateId, s.id);
        return (
          <div key={s.id} className="flex items-center justify-between gap-4 px-5 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-zinc-900">{s.name}</p>
              <p className="text-xs text-zinc-500">
                {s.email}
                {s.company ? ` · ${s.company}` : ""}
              </p>
            </div>
            <form action={action}>
              <button
                type="submit"
                className={
                  required
                    ? "shrink-0 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
                    : "shrink-0 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700"
                }
              >
                {required ? "Required — remove" : "Require for this template"}
              </button>
            </form>
          </div>
        );
      })}
    </div>
  );
}
