"use server";

import { requireRole } from "@/lib/auth/session";
import { performAssignment } from "@/lib/projects/assign";

export async function assignConsultant(projectId: string, consultantId: string) {
  await requireRole("super_admin");
  await performAssignment(projectId, consultantId);
}

// Form-bound variant: call with .bind(null, projectId) so formData arrives as second arg
export async function assignConsultantFromForm(projectId: string, formData: FormData) {
  await requireRole("super_admin");
  const consultantId = formData.get("consultant_id") as string | null;
  if (!consultantId) throw new Error("consultant_id required");
  await performAssignment(projectId, consultantId);
}
