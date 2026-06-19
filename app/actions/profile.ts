"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";

const ProfileSchema = z.object({
  first_name: z.string().min(1, "Required"),
  last_name: z.string().min(1, "Required"),
  phone: z.string().min(1, "Required"),
  company_role: z.string().min(1, "Required"),
  state_territory: z.enum(["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"], {
    error: "Select a state or territory",
  }),
});

export type UpdateProfileState = {
  saved?: boolean;
  errors?: {
    first_name?: string[];
    last_name?: string[];
    phone?: string[];
    company_role?: string[];
    state_territory?: string[];
    form?: string[];
  };
};

export async function updateProfile(
  _prev: UpdateProfileState,
  formData: FormData
): Promise<UpdateProfileState> {
  const user = await getSessionUser();
  if (!user) return { errors: { form: ["Session expired. Please log in again."] } };

  const validated = ProfileSchema.safeParse({
    first_name: formData.get("first_name"),
    last_name: formData.get("last_name"),
    phone: formData.get("phone"),
    company_role: formData.get("company_role"),
    state_territory: formData.get("state_territory"),
  });

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("users")
    .update(validated.data)
    .eq("id", user.id as string);

  if (error) return { errors: { form: [error.message] } };

  return { saved: true };
}
