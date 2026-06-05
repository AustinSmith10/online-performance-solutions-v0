"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { sendInvite } from "@/lib/auth/invite";
import type { ConsultantAvailability } from "@/types";

const InviteSchema = z.object({
  email: z.string().email({ error: "Valid email required" }).trim().toLowerCase(),
  role: z.enum(["client", "consultant"], { error: "Invalid role" }),
  org_id: z.string().uuid({ error: "Invalid organisation" }).optional().or(z.literal("")),
});

export type InviteUserState = {
  errors?: {
    email?: string[];
    role?: string[];
    org_id?: string[];
    form?: string[];
  };
};

export async function inviteUser(
  _prev: InviteUserState,
  formData: FormData
): Promise<InviteUserState> {
  await requireRole("super_admin");

  const rawOrgId = formData.get("org_id") as string | null;
  const validated = InviteSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
    org_id: rawOrgId || undefined,
  });

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const { email, role, org_id } = validated.data;

  if (role === "client" && !org_id) {
    return { errors: { org_id: ["Organisation required for client users"] } };
  }

  const result = await sendInvite(email, role, org_id || undefined);
  if (result.error) return { errors: { form: [result.error] } };

  revalidatePath("/admin/users");
  redirect(`/admin/users/${result.userId}`);
}

export async function unlockUser(userId: string) {
  await requireRole("super_admin");

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("users")
    .update({ is_locked: false, failed_login_count: 0 })
    .eq("id", userId);

  if (error) throw new Error(error.message);

  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
}

export async function setConsultantAvailability(
  userId: string,
  availability: ConsultantAvailability
) {
  await requireRole("super_admin");

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("users")
    .update({ availability })
    .eq("id", userId);

  if (error) throw new Error(error.message);

  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
}
