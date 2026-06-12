"use server";

import { requireRole } from "@/lib/auth/session";
import { performAssignment } from "@/lib/projects/assign";

export type AssignState = { error?: string; success?: boolean };

export async function assignConsultant(projectId: string, consultantId: string) {
  await requireRole("super_admin");
  await performAssignment(projectId, consultantId);
}

// Form-bound variant for useActionState: bind(null, projectId) → (prevState, formData)
export async function assignConsultantFromForm(
  projectId: string,
  _prev: AssignState,
  formData: FormData
): Promise<AssignState> {
  await requireRole("super_admin");
  const consultantId = formData.get("consultant_id") as string | null;
  if (!consultantId) return { error: "Please select a consultant." };
  try {
    await performAssignment(projectId, consultantId);
    return { success: true };
  } catch (err) {
    console.error("[assignConsultantFromForm]", err);
    return { error: err instanceof Error ? err.message : "Assignment failed. Please try again." };
  }
}
