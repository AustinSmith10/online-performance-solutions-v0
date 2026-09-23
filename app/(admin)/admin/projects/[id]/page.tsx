import { ProjectWorkspace } from "@/app/_shared/project-detail/ProjectWorkspace";

// Role gating happens once in app/(admin)/admin/layout.tsx. The composition
// itself is shared with the consultant page — see ProjectWorkspace.
export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  return <ProjectWorkspace id={id} searchParams={sp} role="admin" />;
}
