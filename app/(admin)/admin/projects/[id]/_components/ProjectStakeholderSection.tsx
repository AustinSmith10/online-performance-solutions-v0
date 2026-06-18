import { removeProjectStakeholder } from "@/app/actions/stakeholders";
import { AddProjectStakeholderForm } from "./AddProjectStakeholderForm";

interface StakeholderRow {
  id: string;
  name: string;
  email: string;
  company: string | null;
}

interface Props {
  projectId: string;
  stakeholders: StakeholderRow[];
}

export function ProjectStakeholderSection({ projectId, stakeholders }: Props) {
  return (
    <div className="space-y-4">
      {stakeholders.length > 0 ? (
        <table className="w-full text-sm">
          <tbody className="divide-y divide-zinc-50">
            {stakeholders.map((s) => {
              const removeAction = removeProjectStakeholder.bind(null, projectId, s.id);
              return (
                <tr key={s.id}>
                  <td className="py-2 text-zinc-900">{s.name}</td>
                  <td className="py-2 text-zinc-500">{s.email}</td>
                  <td className="py-2 text-right">
                    <form action={removeAction}>
                      <button type="submit" className="text-xs text-red-600 hover:underline">
                        Remove
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-zinc-400">None — using inherited stakeholder list.</p>
      )}
      <AddProjectStakeholderForm projectId={projectId} />
    </div>
  );
}
