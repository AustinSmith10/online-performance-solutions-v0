/**
 * Seeds two active templates for the Stockland org so the "Report type"
 * dropdown appears on the client submission form (/portal/submit).
 *
 * Idempotent — skips any template whose name already exists on Stockland.
 *
 * Run with:
 *   npx tsx --env-file=.env.local scripts/seed-templates.ts
 */
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// ── Token definitions shared by both templates ────────────────────────────────
// Each item maps to a template_field_mappings row.
// field_key must match a known TOKEN_PREFIXES prefix (client/extract/org/sys/project).

type TokenDef = {
  placeholder_token: string;
  field_key: "client" | "extract" | "org" | "sys" | "project";
  display_label: string;
  extraction_hint?: string;
  is_required: boolean;
  sort_order: number;
  in_template: boolean;
};

const SHARED_TOKENS: TokenDef[] = [
  // ── Extracted from uploaded documents ────────────────────────────────────
  {
    placeholder_token: "EXTRACT_ADDRESS",
    field_key: "extract",
    display_label: "Site address",
    extraction_hint: "The full street address of the property, including suburb and state, as printed on the purchase order or building plans.",
    is_required: true,
    sort_order: 10,
    in_template: true,
  },
  {
    placeholder_token: "EXTRACT_LOT_NO",
    field_key: "extract",
    display_label: "Lot number",
    extraction_hint: "The lot number as it appears on the purchase order (e.g. Lot 42, Lot 7).",
    is_required: true,
    sort_order: 20,
    in_template: true,
  },
  {
    placeholder_token: "EXTRACT_DP_NO",
    field_key: "extract",
    display_label: "Deposited plan number",
    extraction_hint: "The DP or deposited plan number shown on the purchase order or title documents (e.g. DP 123456).",
    is_required: true,
    sort_order: 30,
    in_template: true,
  },
  {
    placeholder_token: "EXTRACT_DEV_NAME",
    field_key: "extract",
    display_label: "Development name",
    extraction_hint: "The name of the Halcyon development (e.g. Halcyon Promenade, Halcyon Rise). Usually appears in the header of the purchase order.",
    is_required: true,
    sort_order: 40,
    in_template: true,
  },
  {
    placeholder_token: "EXTRACT_TRUSTEE",
    field_key: "extract",
    display_label: "Trustee entity",
    extraction_hint: "The legal trustee entity name associated with the Halcyon development, as stated on the purchase order.",
    is_required: true,
    sort_order: 50,
    in_template: true,
  },
  {
    placeholder_token: "EXTRACT_RAINFALL_INTENSITY",
    field_key: "extract",
    display_label: "Rainfall intensity (mm/hr)",
    extraction_hint: "The AEP rainfall intensity value for the site, typically shown in the hydraulic or drainage plans.",
    is_required: true,
    sort_order: 60,
    in_template: true,
  },
  // ── Org-level config (pulled from org_config, client can confirm) ─────────
  {
    placeholder_token: "ORG_CERTIFIER_NAME",
    field_key: "org",
    display_label: "Certifier name",
    is_required: true,
    sort_order: 70,
    in_template: true,
  },
  {
    placeholder_token: "ORG_CERTIFIER_LICENCE",
    field_key: "org",
    display_label: "Certifier licence number",
    is_required: true,
    sort_order: 80,
    in_template: true,
  },
  // ── System — auto-filled by OPS ──────────────────────────────────────────
  {
    placeholder_token: "SYS_GEN_DATE",
    field_key: "sys",
    display_label: "Report generation date",
    is_required: true,
    sort_order: 90,
    in_template: true,
  },
  {
    placeholder_token: "SYS_SUB_DATE",
    field_key: "sys",
    display_label: "Submission date",
    is_required: true,
    sort_order: 100,
    in_template: true,
  },
  {
    placeholder_token: "SYS_REV_NO",
    field_key: "sys",
    display_label: "Revision number",
    is_required: true,
    sort_order: 110,
    in_template: true,
  },
  // ── Consultant-entered ────────────────────────────────────────────────────
  {
    placeholder_token: "PROJECT_NO",
    field_key: "project",
    display_label: "DDEG project number",
    is_required: true,
    sort_order: 120,
    in_template: true,
  },
];

// Townhouse template adds a floor area token not in the residential one
const TOWNHOUSE_EXTRA_TOKENS: TokenDef[] = [
  {
    placeholder_token: "EXTRACT_FLOOR_AREA",
    field_key: "extract",
    display_label: "Gross floor area (m²)",
    extraction_hint: "The total gross floor area in square metres, as noted on the building plans or schedule of areas.",
    is_required: true,
    sort_order: 65,
    in_template: true,
  },
];

const TEMPLATES = [
  {
    name: "PBDB — Residential",
    storagePath: "seed/stockland-residential-template.docx",
    tokens: SHARED_TOKENS,
  },
  {
    name: "PBDB — Townhouse",
    storagePath: "seed/stockland-townhouse-template.docx",
    tokens: [...SHARED_TOKENS, ...TOWNHOUSE_EXTRA_TOKENS],
  },
];

async function main() {
  // ── Resolve Stockland org ─────────────────────────────────────────────────
  const { data: stockland, error: orgErr } = await supabase
    .from("organisations")
    .select("id")
    .eq("slug", "stockland")
    .single();

  if (orgErr || !stockland) {
    console.error("Stockland org not found — run the main seed first:", orgErr?.message);
    process.exit(1);
  }
  console.log("Found Stockland org:", stockland.id);

  // ── Resolve any super_admin as creator ────────────────────────────────────
  const { data: adminUser, error: adminErr } = await supabase
    .from("users")
    .select("id")
    .eq("role", "super_admin")
    .limit(1)
    .single();

  if (adminErr || !adminUser) {
    console.error("No super_admin user found — run the main seed first:", adminErr?.message);
    process.exit(1);
  }
  console.log("Using admin:", adminUser.id);

  // ── Check which templates already exist ───────────────────────────────────
  const { data: existing } = await supabase
    .from("templates")
    .select("name")
    .eq("org_id", stockland.id)
    .in("name", TEMPLATES.map((t) => t.name));

  const existingNames = new Set((existing ?? []).map((t) => t.name));

  // ── Insert templates ──────────────────────────────────────────────────────
  for (const tmpl of TEMPLATES) {
    if (existingNames.has(tmpl.name)) {
      console.log(`Template already exists — skipping: "${tmpl.name}"`);
      continue;
    }

    const templateId = crypto.randomUUID();

    const { error: insertErr } = await supabase.from("templates").insert({
      id: templateId,
      org_id: stockland.id,
      name: tmpl.name,
      storage_path: tmpl.storagePath,
      status: "active",
      created_by: adminUser.id,
    });

    if (insertErr) {
      console.error(`Failed to insert template "${tmpl.name}":`, insertErr.message);
      continue;
    }

    const mappingRows = tmpl.tokens.map((t) => ({
      template_id: templateId,
      placeholder_token: t.placeholder_token,
      field_key: t.field_key,
      is_mapped: true,
      display_label: t.display_label,
      extraction_hint: t.extraction_hint ?? null,
      is_required: t.is_required,
      sort_order: t.sort_order,
      in_template: t.in_template,
    }));

    const { error: mappingErr } = await supabase
      .from("template_field_mappings")
      .insert(mappingRows);

    if (mappingErr) {
      console.error(`Failed to insert mappings for "${tmpl.name}":`, mappingErr.message);
      continue;
    }

    console.log(`Created template "${tmpl.name}" (${tmpl.tokens.length} tokens) — id: ${templateId}`);
  }

  console.log("\nDone. Log in as client@ops.test and go to /portal/submit");
  console.log("You should see a 'Report type' dropdown with both templates.");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
