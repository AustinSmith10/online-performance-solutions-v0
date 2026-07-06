"use server";

import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { auditLog } from "@/lib/audit/log";
import { setDigestSchedule, isValidTime } from "@/lib/settings/digest-schedule";

const DigestScheduleSchema = z.object({
  morning: z.string().refine(isValidTime, { error: "Enter a valid time (HH:MM)" }),
  afternoon: z.string().refine(isValidTime, { error: "Enter a valid time (HH:MM)" }),
});

export type UpdateDigestScheduleState = {
  saved?: boolean;
  errors?: {
    morning?: string[];
    afternoon?: string[];
    form?: string[];
  };
};

export async function updateDigestScheduleAction(
  _prev: UpdateDigestScheduleState,
  formData: FormData
): Promise<UpdateDigestScheduleState> {
  const actor = await requireRole("super_admin", "admin");

  const validated = DigestScheduleSchema.safeParse({
    morning: formData.get("morning"),
    afternoon: formData.get("afternoon"),
  });

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const supabase = createAdminClient();
  const { error } = await setDigestSchedule(supabase, validated.data, actor.id as string);

  if (error) return { errors: { form: [error] } };

  await auditLog("settings.digest_schedule_updated", actor.id as string, actor.email as string, {
    metadata: validated.data,
  });

  return { saved: true };
}
