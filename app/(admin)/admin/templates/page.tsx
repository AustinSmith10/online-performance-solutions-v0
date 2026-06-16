import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { ClickableRow } from "@/components/ClickableRow";

type TemplateRow = {
  id: string;
  name: string;
  status: string;
  created_at: string;
  org: { id: string; name: string } | null;
};

export default async function TemplatesPage() {
  await requireRole("super_admin");
  const supabase = createAdminClient();

  const { data: templates } = await supabase
    .from("templates")
    .select("id, name, status, created_at, org:org_id(id, name)")
    .order("created_at", { ascending: false });

  const rows = (templates ?? []) as unknown as TemplateRow[];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900">Templates</h1>
        <Link
          href="/admin/templates/upload"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
        >
          Upload template
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
          No templates yet. Upload one from an organisation page.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="border-b border-zinc-100">
              <tr>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Name</th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Organisation</th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Status</th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Uploaded</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {rows.map((t) => (
                <ClickableRow key={t.id} href={`/admin/templates/${t.id}`}>
                  <td className="px-5 py-3 font-medium text-zinc-900">{t.name}</td>
                  <td className="px-5 py-3 text-zinc-600">
                    {t.org ? t.org.name : <span className="text-zinc-400">—</span>}
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="px-5 py-3 text-zinc-500">
                    {new Date(t.created_at).toLocaleDateString("en-AU")}
                  </td>
                </ClickableRow>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-green-100 text-green-700",
    inactive: "bg-zinc-100 text-zinc-500",
    draft: "bg-amber-100 text-amber-700",
  };
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] ?? "bg-zinc-100 text-zinc-500"}`}
    >
      {status}
    </span>
  );
}
