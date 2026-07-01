import { removeOrgStakeholder } from "@/app/actions/stakeholders";
import { AddStakeholderForm } from "./add-stakeholder-form";

interface StakeholderRow {
  id: string;
  name: string;
  email: string;
  company: string | null;
}

interface Props {
  orgId: string;
  stakeholders: StakeholderRow[];
}

export function StakeholderList({ orgId, stakeholders }: Props) {
  return (
    <div className="space-y-6">
      {stakeholders.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No default stakeholders configured. Add at least one below.
        </p>
      ) : (
        <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead className="border-b border-zinc-100">
            <tr>
              <th className="pb-2 text-left font-medium text-zinc-500">Name</th>
              <th className="pb-2 text-left font-medium text-zinc-500">Email</th>
              <th className="pb-2 text-left font-medium text-zinc-500">Company</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50">
            {stakeholders.map((s) => {
              const removeAction = removeOrgStakeholder.bind(null, orgId, s.id);
              return (
                <tr key={s.id}>
                  <td className="py-2 font-medium text-zinc-900">{s.name}</td>
                  <td className="py-2 text-zinc-600">{s.email}</td>
                  <td className="py-2 text-zinc-500">{s.company ?? "—"}</td>
                  <td className="py-2 text-right">
                    <form action={removeAction}>
                      <button
                        type="submit"
                        className="text-xs text-red-600 hover:underline"
                      >
                        Remove
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}

      <AddStakeholderForm orgId={orgId} />
    </div>
  );
}
