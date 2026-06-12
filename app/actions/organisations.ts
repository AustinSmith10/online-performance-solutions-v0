"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { auditLog } from "@/lib/audit/log";

const OrgSchema = z.object({
  name: z.string().min(1, { error: "Name required" }).trim(),
  payment_method: z.enum(["upfront", "credit_deduction", "deferred"], {
    error: "Invalid payment method",
  }),
  delivery_working_days: z.coerce
    .number()
    .int()
    .min(1, { error: "Must be at least 1 day" })
    .max(30, { error: "Must be 30 days or fewer" }),
  state_territory: z.string().min(1, { error: "State/territory required" }),
  abandoned_draft_days: z.coerce
    .number()
    .int()
    .min(1, { error: "Must be at least 1 day" })
    .max(90, { error: "Must be 90 days or fewer" }),
  credit_limit: z.coerce.number().int().min(0).default(0),
  email_whitelist: z.string().optional(),
});

export type OrgFormState = {
  saved?: boolean;
  errors?: {
    name?: string[];
    payment_method?: string[];
    delivery_working_days?: string[];
    state_territory?: string[];
    abandoned_draft_days?: string[];
    credit_limit?: string[];
    form?: string[];
  };
};

function parseEmailWhitelist(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function createOrganisation(
  _prev: OrgFormState,
  formData: FormData
): Promise<OrgFormState> {
  const actor = await requireRole("super_admin");

  const validated = OrgSchema.safeParse({
    name: formData.get("name"),
    payment_method: formData.get("payment_method"),
    delivery_working_days: formData.get("delivery_working_days"),
    state_territory: formData.get("state_territory"),
    abandoned_draft_days: formData.get("abandoned_draft_days"),
    credit_limit: formData.get("credit_limit") || 0,
    email_whitelist: formData.get("email_whitelist"),
  });

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const { email_whitelist: rawWhitelist, ...fields } = validated.data;
  const email_whitelist = parseEmailWhitelist(rawWhitelist);
  const slug = slugify(fields.name);

  const supabase = createAdminClient();

  // Check slug uniqueness; append suffix if needed
  const { data: existing } = await supabase
    .from("organisations")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  const finalSlug = existing
    ? `${slug}-${Date.now().toString(36)}`
    : slug;

  const { data: org, error } = await supabase
    .from("organisations")
    .insert({ ...fields, slug: finalSlug, email_whitelist })
    .select("id")
    .single();

  if (error) return { errors: { form: [error.message] } };

  await auditLog("org.created", actor.id, actor.email, {
    orgId: org.id,
    metadata: { name: fields.name, payment_method: fields.payment_method },
  });

  revalidatePath("/admin/organisations");
  redirect(`/admin/organisations/${org.id}`);
}

export async function updateOrganisation(
  id: string,
  _prev: OrgFormState,
  formData: FormData
): Promise<OrgFormState> {
  const actor = await requireRole("super_admin");

  const validated = OrgSchema.safeParse({
    name: formData.get("name"),
    payment_method: formData.get("payment_method"),
    delivery_working_days: formData.get("delivery_working_days"),
    state_territory: formData.get("state_territory"),
    abandoned_draft_days: formData.get("abandoned_draft_days"),
    credit_limit: formData.get("credit_limit") || 0,
    email_whitelist: formData.get("email_whitelist"),
  });

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const { email_whitelist: rawWhitelist, ...fields } = validated.data;
  const email_whitelist = parseEmailWhitelist(rawWhitelist);

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("organisations")
    .update({ ...fields, email_whitelist, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { errors: { form: [error.message] } };

  await auditLog("org.updated", actor.id, actor.email, {
    orgId: id,
    metadata: { name: fields.name, payment_method: fields.payment_method },
  });

  revalidatePath(`/admin/organisations/${id}`);
  revalidatePath("/admin/organisations");
  return { saved: true };
}

export async function setOrgFrozen(id: string, frozen: boolean) {
  const actor = await requireRole("super_admin");

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("organisations")
    .update({ is_frozen: frozen, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(error.message);

  await auditLog(frozen ? "org.frozen" : "org.unfrozen", actor.id, actor.email, {
    orgId: id,
    metadata: { source: "organisations" },
  });

  revalidatePath(`/admin/organisations/${id}`);
  revalidatePath("/admin/organisations");
}
