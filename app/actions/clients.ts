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
});

export type ClientFormState = {
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

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function createClient(
  _prev: ClientFormState,
  formData: FormData
): Promise<ClientFormState> {
  const actor = await requireRole("super_admin");

  const validated = OrgSchema.safeParse({
    name: formData.get("name"),
    payment_method: formData.get("payment_method"),
    delivery_working_days: formData.get("delivery_working_days"),
    state_territory: formData.get("state_territory"),
    abandoned_draft_days: formData.get("abandoned_draft_days"),
    credit_limit: formData.get("credit_limit") || 0,
  });

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const fields = validated.data;
  const slug = slugify(fields.name);

  const supabase = createAdminClient();

  // Check slug uniqueness; append suffix if needed
  const { data: existing } = await supabase
    .from("clients")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  const finalSlug = existing
    ? `${slug}-${Date.now().toString(36)}`
    : slug;

  const { data: org, error } = await supabase
    .from("clients")
    .insert({ ...fields, slug: finalSlug, email_whitelist: [] })
    .select("id")
    .single();

  if (error) return { errors: { form: [error.message] } };

  await auditLog("org.created", actor.id, actor.email, {
    orgId: org.id,
    metadata: { name: fields.name, payment_method: fields.payment_method },
  });

  revalidatePath("/admin/clients");
  redirect(`/admin/clients/${org.id}?created=1`);
}

export async function updateClient(
  id: string,
  _prev: ClientFormState,
  formData: FormData
): Promise<ClientFormState> {
  const actor = await requireRole("super_admin", "admin");

  const validated = OrgSchema.safeParse({
    name: formData.get("name"),
    payment_method: formData.get("payment_method"),
    delivery_working_days: formData.get("delivery_working_days"),
    state_territory: formData.get("state_territory"),
    abandoned_draft_days: formData.get("abandoned_draft_days"),
    credit_limit: formData.get("credit_limit") || 0,
  });

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("clients")
    .update({ ...validated.data, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { errors: { form: [error.message] } };

  await auditLog("org.updated", actor.id, actor.email, {
    orgId: id,
    metadata: { name: validated.data.name, payment_method: validated.data.payment_method },
  });

  revalidatePath(`/admin/clients/${id}`);
  revalidatePath("/admin/clients");
  return { saved: true };
}

export type ClientConfigState = { error?: string; saved?: boolean };

export async function updateOrgConfig(
  orgId: string,
  _prev: ClientConfigState,
  formData: FormData
): Promise<ClientConfigState> {
  const actor = await requireRole("super_admin", "admin");

  const config: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("ORG_") && typeof value === "string") {
      config[key] = value.trim();
    }
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("clients")
    .update({ client_config: config, updated_at: new Date().toISOString() })
    .eq("id", orgId);

  if (error) return { error: error.message };

  await auditLog("org.config_updated", actor.id, actor.email, {
    orgId,
    metadata: { keys: Object.keys(config) },
  });

  revalidatePath(`/admin/clients/${orgId}`);
  return { saved: true };
}

const DomainSchema = z
  .string()
  .min(1, "Domain required")
  .max(253)
  .toLowerCase()
  .trim()
  .regex(/^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/, "Invalid domain format");

export type WhitelistState = { saved?: boolean; error?: string };

export async function addEmailDomain(
  orgId: string,
  _prev: WhitelistState,
  formData: FormData
): Promise<WhitelistState> {
  await requireRole("super_admin", "admin");

  const parsed = DomainSchema.safeParse(formData.get("domain"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const domain = parsed.data;
  const supabase = createAdminClient();

  const { data: org } = await supabase
    .from("clients")
    .select("email_whitelist")
    .eq("id", orgId)
    .single();

  const current: string[] = org?.email_whitelist ?? [];
  if (current.includes(domain)) return { error: "Domain already in whitelist" };

  const { error } = await supabase
    .from("clients")
    .update({ email_whitelist: [...current, domain], updated_at: new Date().toISOString() })
    .eq("id", orgId);

  if (error) return { error: error.message };

  revalidatePath(`/admin/clients/${orgId}`);
  return { saved: true };
}

export async function removeEmailDomain(orgId: string, domain: string) {
  await requireRole("super_admin", "admin");

  const supabase = createAdminClient();

  const { data: org } = await supabase
    .from("clients")
    .select("email_whitelist")
    .eq("id", orgId)
    .single();

  const updated = (org?.email_whitelist ?? []).filter((d: string) => d !== domain);

  const { error } = await supabase
    .from("clients")
    .update({ email_whitelist: updated, updated_at: new Date().toISOString() })
    .eq("id", orgId);

  if (error) throw new Error(error.message);

  revalidatePath(`/admin/clients/${orgId}`);
}

export type DeleteClientState = { error?: string };

export async function deleteClient(
  orgId: string,
  _prev: DeleteClientState,
  _formData: FormData
): Promise<DeleteClientState> {
  const actor = await requireRole("super_admin");
  const supabase = createAdminClient();

  // Read name before deletion for the audit entry
  const { data: org } = await supabase
    .from("clients")
    .select("name")
    .eq("id", orgId)
    .single();

  if (!org) return { error: "Client not found." };

  // Delegate to the SQL function — it validates, handles audit_log trigger, and deletes
  const { error } = await supabase.rpc("admin_delete_client", { p_client_id: orgId });
  if (error) {
    return { error: error.message };
  }

  await auditLog("org.deleted", actor.id, actor.email, {
    orgId,
    metadata: { name: org.name },
  });

  revalidatePath("/admin/clients");
  redirect("/admin/clients?deleted=1");
}

export async function setOrgFrozen(id: string, frozen: boolean) {
  const actor = await requireRole("super_admin", "admin");

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("clients")
    .update({ is_frozen: frozen, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(error.message);

  await auditLog(frozen ? "org.frozen" : "org.unfrozen", actor.id, actor.email, {
    orgId: id,
    metadata: { source: "clients" },
  });

  revalidatePath(`/admin/clients/${id}`);
  revalidatePath("/admin/clients");
}
