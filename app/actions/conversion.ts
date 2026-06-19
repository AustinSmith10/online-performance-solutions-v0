"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { deliverPbdr } from "@/lib/documents/delivery";

export type ConvertState = { error?: string; success?: boolean };

/**
 * Super Admin manual retry for PBDR conversion.
 * Auto-conversion fires from submitApproval when all stakeholders acknowledge.
 * This button is a fallback if that auto-trigger failed.
 */
export async function triggerPbdrConversion(
  projectId: string,
  _prev: ConvertState,
  _formData: FormData
): Promise<ConvertState> {
  const actor = await requireRole("super_admin");

  const result = await deliverPbdr(projectId, actor.id, actor.email as string);

  if (!result.success) {
    return { error: result.reason ?? "Conversion failed. Please try again." };
  }

  revalidatePath(`/admin/projects/${projectId}`);
  return { success: true };
}
