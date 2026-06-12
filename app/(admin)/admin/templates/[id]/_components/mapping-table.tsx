import type { TokenSource } from "@/lib/documents/field-keys";

interface Row {
  id: string;
  placeholder_token: string;
  field_key: string | null;
  is_mapped: boolean;
}

interface Props {
  rows: Row[];
  missingOrgTokens?: string[];
}

const SOURCE_STYLES: Record<TokenSource, string> = {
  client:  "bg-green-100 text-green-700",
  extract: "bg-blue-100 text-blue-700",
  org:     "bg-purple-100 text-purple-700",
  sys:     "bg-zinc-100 text-zinc-600",
  project: "bg-amber-100 text-amber-700",
  unknown: "bg-red-100 text-red-700",
};

const SOURCE_LABELS: Record<TokenSource, string> = {
  client:  "Client input",
  extract: "Extracted",
  org:     "Org config",
  sys:     "System",
  project: "Project",
  unknown: "Unknown",
};

export function MappingTable({ rows, missingOrgTokens = [] }: Props) {
  return (
    <table className="w-full text-sm">
      <thead className="border-b border-zinc-100">
        <tr>
          <th className="px-5 py-3 text-left font-medium text-zinc-500">Token</th>
          <th className="px-5 py-3 text-left font-medium text-zinc-500">Source</th>
          <th className="px-5 py-3 text-center font-medium text-zinc-500">Valid</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-zinc-50">
        {rows.map((row) => {
          const source = (row.field_key ?? "unknown") as TokenSource;
          return (
            <tr key={row.id} className={row.is_mapped ? "" : "bg-red-50/40"}>
              <td className="px-5 py-3 font-mono text-xs text-zinc-800">
                {"{"}
                {row.placeholder_token}
                {"}"}
              </td>
              <td className="px-5 py-3">
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${SOURCE_STYLES[source]}`}>
                  {SOURCE_LABELS[source]}
                </span>
              </td>
              <td className="px-5 py-3 text-center">
                {row.is_mapped ? (
                  <span className="text-green-600" title="Recognised prefix">✓</span>
                ) : (
                  <span className="font-bold text-red-500" title="Unrecognised prefix — blocks activation">✗</span>
                )}
              </td>
            </tr>
          );
        })}

        {missingOrgTokens.map((token) => (
          <tr key={`missing-${token}`} className="bg-amber-50/40">
            <td className="px-5 py-3 font-mono text-xs text-zinc-400 line-through">
              {"{"}
              {token}
              {"}"}
            </td>
            <td className="px-5 py-3">
              <span className="inline-block rounded-full px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700">
                Org config
              </span>
            </td>
            <td className="px-5 py-3 text-center">
              <span className="font-bold text-amber-500" title="Configured in org but not present in template">!</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
