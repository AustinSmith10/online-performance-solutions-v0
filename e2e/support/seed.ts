import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import path from "path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "./supabase";
import { generateTokenString, hashToken } from "./tokens";

const STOCKLAND_SLUG = "stockland";

export interface SeededUser {
  id: string;
  email: string;
  client_id: string | null;
}

/** Client org + the three role accounts seeded by supabase/seed.ts. Throws with setup instructions if missing. */
export async function requireSeedFixtures(sb: SupabaseClient = adminClient()) {
  const { data: client, error: clientErr } = await sb
    .from("clients")
    .select("id, name")
    .eq("slug", STOCKLAND_SLUG)
    .maybeSingle();

  if (clientErr || !client) {
    throw new Error(
      `[e2e] Seed client "${STOCKLAND_SLUG}" not found. Run \`npm run seed\` against your local ` +
        "Supabase instance before running the E2E suite (see e2e/support/env.ts for how to point it locally)."
    );
  }

  const { data: users, error: usersErr } = await sb
    .from("users")
    .select("id, email, client_id, role")
    .in("email", ["admin@ops.test", "consultant@ops.test", "stakeholder@ops.test"]);

  if (usersErr || !users || users.length < 3) {
    throw new Error(
      "[e2e] Seed users (admin@ops.test / consultant@ops.test / stakeholder@ops.test) not found. " +
        "Run `npm run seed` against your local Supabase instance before running the E2E suite."
    );
  }

  const byEmail = new Map(users.map((u) => [u.email as string, u as SeededUser]));
  return {
    client: client as { id: string; name: string },
    admin: byEmail.get("admin@ops.test")!,
    consultant: byEmail.get("consultant@ops.test")!,
    stakeholder: byEmail.get("stakeholder@ops.test")!,
  };
}

export interface ActiveTemplateInfo {
  id: string;
  name: string;
  requiresExtraction: boolean;
}

/**
 * First active template for the seed client, plus whether any of its file
 * requirements demand AI extraction — used by submission.spec.ts to decide
 * whether it can run without an ANTHROPIC_API_KEY configured.
 */
export async function findActiveTemplate(
  clientId: string,
  sb: SupabaseClient = adminClient()
): Promise<ActiveTemplateInfo | null> {
  const { data: template } = await sb
    .from("templates")
    .select("id, name")
    .eq("client_id", clientId)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("name")
    .limit(1)
    .maybeSingle();

  if (!template) return null;

  const { data: requirements } = await sb
    .from("file_requirements")
    .select("extraction")
    .eq("template_id", template.id as string);

  const requiresExtraction = (requirements ?? []).some((r) => r.extraction === true);

  return { id: template.id as string, name: template.name as string, requiresExtraction };
}

export interface SeededProjectOptions {
  clientId: string;
  submittedBy: string;
  status: string;
  templateId?: string | null;
  assignedConsultantId?: string | null;
  reviewCycle?: number;
  creditDeducted?: boolean;
  siteAddress?: string;
  qaCompletedBy?: string | null;
}

export interface SeededProject {
  id: string;
  projectNumber: string;
}

/**
 * Inserts a `projects` row directly at a given pipeline stage, so each spec
 * can target the stage it's testing without re-running every earlier stage
 * through the UI. Column set mirrors real writes in app/actions/submission.ts,
 * app/actions/projects.ts, and lib/stakeholders/dispatch.ts.
 */
export async function seedProject(
  opts: SeededProjectOptions,
  sb: SupabaseClient = adminClient()
): Promise<SeededProject> {
  const suffix = randomUUID().slice(0, 8);
  const projectNumber = `E2E-${suffix}`;
  const siteAddress = opts.siteAddress ?? `${suffix} E2E Test Street, Testville NSW 2000`;

  const { data, error } = await sb
    .from("projects")
    .insert({
      client_id: opts.clientId,
      submitted_by: opts.submittedBy,
      status: opts.status,
      project_number: projectNumber,
      po_number: `PO-${suffix}`,
      site_address: siteAddress,
      template_id: opts.templateId ?? null,
      assigned_consultant_id: opts.assignedConsultantId ?? null,
      review_cycle: opts.reviewCycle ?? 1,
      credit_deducted: opts.creditDeducted ?? false,
      qa_completed_by: opts.qaCompletedBy ?? null,
      extracted_fields: { EXTRACT_ADDRESS: siteAddress },
      expected_delivery_date: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString().slice(0, 10),
    })
    .select("id, project_number")
    .single();

  if (error || !data) {
    throw new Error(`[e2e] Failed to seed project: ${error?.message}`);
  }

  return { id: data.id as string, projectNumber: data.project_number as string };
}

export interface SeededReview {
  id: string;
  token: string;
}

/**
 * Inserts a `stakeholder_reviews` row with a known plaintext token, the same
 * shape dispatchPbdb() writes (lib/stakeholders/dispatch.ts) — lets
 * approval.spec.ts exercise /approve/[token] without going through the real
 * dispatch pipeline (which needs a live Gotenberg instance to render the
 * PBDB PDF, see e2e/support/optional-deps.ts).
 */
export async function seedStakeholderReview(
  params: {
    projectId: string;
    reviewCycle?: number;
    stakeholderEmail: string;
    stakeholderName: string;
    status?: string;
    expiresInDays?: number;
  },
  sb: SupabaseClient = adminClient()
): Promise<SeededReview> {
  const token = generateTokenString();
  const expiresAt = new Date(Date.now() + (params.expiresInDays ?? 5) * 24 * 3600 * 1000);

  const { data, error } = await sb
    .from("stakeholder_reviews")
    .insert({
      project_id: params.projectId,
      review_cycle: params.reviewCycle ?? 1,
      stakeholder_email: params.stakeholderEmail.toLowerCase(),
      stakeholder_name: params.stakeholderName,
      token,
      token_hash: hashToken(token),
      dispatched_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
      status: params.status ?? "pending",
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`[e2e] Failed to seed stakeholder_reviews row: ${error?.message}`);
  }

  return { id: data.id as string, token };
}

export interface E2eTemplate {
  id: string;
  requirementId: string;
}

const E2E_TEMPLATE_NAME = "E2E Test Template";
const E2E_TEMPLATE_STORAGE_PATH = "e2e/e2e-pbdb-template.docx";

/**
 * Idempotently creates a small, fully self-contained template (with a real
 * .docx behind it in the "templates" storage bucket, and one file
 * requirement with `extraction: false`) for specs that need to drive the
 * real "Generate PBDB" -> "Upload QA'd PBDB" pipeline.
 *
 * Deliberately not scripts/seed-templates.ts's templates: those seed
 * `storage_path: "seed/..."` without ever uploading a file to that path
 * (generate-test-pbdb.ts explicitly filters `.not("storage_path", "like",
 * "seed/%")` for exactly this reason), and their file requirements all need
 * AI extraction. This helper gives the dispatch/delivery specs a template
 * that actually works end to end without any real document content or an
 * ANTHROPIC_API_KEY.
 */
export async function ensureE2eTemplate(
  clientId: string,
  sb: SupabaseClient = adminClient()
): Promise<E2eTemplate> {
  const { data: existing } = await sb
    .from("templates")
    .select("id")
    .eq("client_id", clientId)
    .eq("name", E2E_TEMPLATE_NAME)
    .is("deleted_at", null)
    .maybeSingle();

  let templateId = existing?.id as string | undefined;

  if (!templateId) {
    const docxBuffer = readFileSync(path.join(__dirname, "..", "fixtures", "sample-pbdb.docx"));
    const { error: uploadErr } = await sb.storage
      .from("templates")
      .upload(E2E_TEMPLATE_STORAGE_PATH, docxBuffer, {
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: true,
      });
    if (uploadErr) {
      throw new Error(`[e2e] Failed to upload E2E template fixture: ${uploadErr.message}`);
    }

    const { data: inserted, error: insertErr } = await sb
      .from("templates")
      .insert({
        client_id: clientId,
        name: E2E_TEMPLATE_NAME,
        status: "active",
        storage_path: E2E_TEMPLATE_STORAGE_PATH,
      })
      .select("id")
      .single();
    if (insertErr || !inserted) {
      throw new Error(`[e2e] Failed to create E2E template: ${insertErr?.message}`);
    }
    templateId = inserted.id as string;
  }

  const { data: existingReq } = await sb
    .from("file_requirements")
    .select("id")
    .eq("template_id", templateId)
    .maybeSingle();

  let requirementId = existingReq?.id as string | undefined;
  if (!requirementId) {
    const { data: insertedReq, error: reqErr } = await sb
      .from("file_requirements")
      .insert({
        template_id: templateId,
        name: "Purchase order",
        slug: "purchase-order",
        max_count: 1,
        required: true,
        no_duplicates: true,
        extraction: false,
        sort_order: 10,
      })
      .select("id")
      .single();
    if (reqErr || !insertedReq) {
      throw new Error(`[e2e] Failed to create E2E file requirement: ${reqErr?.message}`);
    }
    requirementId = insertedReq.id as string;
  }

  return { id: templateId, requirementId };
}

/** Best-effort teardown — local/ephemeral DB, but keeps repeated runs tidy. */
export async function deleteProjects(projectIds: string[], sb: SupabaseClient = adminClient()) {
  if (projectIds.length === 0) return;
  await sb.from("stakeholder_reviews").delete().in("project_id", projectIds);
  await sb.from("project_files").delete().in("project_id", projectIds);
  await sb.from("projects").delete().in("id", projectIds);
}
