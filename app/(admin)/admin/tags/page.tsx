import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { listTags } from "@/lib/tags/queries";
import { TagManager } from "./_components/TagManager";

export default async function AdminTagsPage() {
  await requireRole("super_admin");
  const supabase = createAdminClient();
  const [tags, { data: counts }] = await Promise.all([
    listTags(supabase),
    supabase.from("account_tags").select("tag_id"),
  ]);

  const usage = new Map<string, number>();
  for (const row of counts ?? []) usage.set(row.tag_id as string, (usage.get(row.tag_id as string) ?? 0) + 1);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-balance text-zinc-900">Tags</h1>
        <p className="mt-1 max-w-[65ch] text-sm text-zinc-500">
          Labels like &ldquo;Manager&rdquo; or &ldquo;VIP&rdquo; that sit beside an account&apos;s name for staff.
          Assign them from any user&apos;s page. Stakeholders never see tags, and they never appear in documents or
          emails.
        </p>
      </div>
      <TagManager tags={tags.map((t) => ({ ...t, assignedCount: usage.get(t.id) ?? 0 }))} />
    </div>
  );
}
