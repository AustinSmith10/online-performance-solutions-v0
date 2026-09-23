import { requireRole } from "@/lib/auth/session";
import { ProjectWorkspace } from "@/app/_shared/project-detail/ProjectWorkspace";

export default async function ConsultantProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireRole("consultant", "super_admin");
  return <ProjectWorkspace id={id} searchParams={sp} role="consultant" userId={user.id} />;
}
