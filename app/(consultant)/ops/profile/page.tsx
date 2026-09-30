import { requireRole } from "@/lib/auth/session";
import { ProfileForm } from "@/components/ProfileForm";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTagsByUserId, listTags } from "@/lib/tags/queries";
import { TagAssigner } from "@/components/TagAssigner";
import { DISCIPLINES } from "@/lib/projects/project-number";

export default async function ConsultantProfilePage() {
  const user = await requireRole("consultant");
  const disciplines = new Set((user as { disciplines?: string[] | null }).disciplines ?? []);

  const supabase = createAdminClient();
  const [tagsMap, allTags] = await Promise.all([getTagsByUserId(supabase, [user.id as string]), listTags(supabase)]);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <ProfileForm
        profile={{
          email: user.email as string,
          first_name: user.first_name as string | null,
          last_name: user.last_name as string | null,
          phone: user.phone as string | null,
          company_role: user.company_role as string | null,
          state_territory: user.state_territory as string | null,
        }}
      />

      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-900">Tags</h2>
        <p className="mt-1 text-sm text-zinc-500">Labels shown beside your name to other staff.</p>
        <div className="mt-3">
          <TagAssigner targetUserId={user.id as string} assigned={tagsMap.get(user.id as string) ?? []} allTags={allTags} />
        </div>
      </div>

      {/* Read-only — disciplines are what "Available jobs" and admin
          assignment filter on, set by an admin (Users → this account →
          Disciplines), not self-editable here. */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-900">Disciplines</h2>
        <p className="mt-1 text-sm text-zinc-500">
          The report types you can pick up. Ask an admin to change this.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {DISCIPLINES.filter((d) => disciplines.has(d.suffix)).map((d) => (
            <span
              key={d.suffix}
              className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-700"
            >
              {d.name}
            </span>
          ))}
          {disciplines.size === 0 && (
            <span className="text-sm text-zinc-500">None set — you won&apos;t see any available jobs until an admin tags you.</span>
          )}
        </div>
      </div>
    </div>
  );
}
