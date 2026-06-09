"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import type { ConsultantAvailability } from "@/types";

export async function setOwnAvailability(availability: ConsultantAvailability) {
  const user = await requireRole("consultant");

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("users")
    .update({ availability })
    .eq("id", user.id);

  if (error) throw new Error(error.message);

  revalidatePath("/availability");
}
