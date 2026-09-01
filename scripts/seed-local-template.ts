/**
 * Seeds one working PBDB template for the Stockland seed client so local
 * manual testing can run a project end-to-end: submit → assign → generate
 * PBDB → QA upload → dispatch → stakeholder review.
 *
 * Unlike the stale scripts/seed-templates.ts (organisations/org_id, no
 * uploaded .docx, extraction-only requirements), this:
 *   - uploads e2e/fixtures/sample-pbdb.docx to the `templates` bucket
 *   - creates an ACTIVE template with a real storage_path
 *   - adds a small field-mapping set (no AI extraction needed)
 *   - adds two org-scope stakeholders + links them as the template roster,
 *     so `dispatchPbdb` actually has recipients
 *   - adds two file requirements (extraction: false)
 *
 * Idempotent — keyed on template name. Re-running is a no-op.
 *
 * Run with:
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/seed-local-template.ts
 */
import { readFileSync } from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const TEMPLATE_NAME = "PBDB — Local Test";
const STORAGE_PATH = "local/local-test-pbdb-template.docx";

const FIELD_MAPPINGS = [
  { placeholder_token: "EXTRACT_ADDRESS", field_key: "extract", display_label: "Site address", is_required: true, sort_order: 10, client_visible: true, client_sort_order: 10 },
  { placeholder_token: "EXTRACT_LOT_NO", field_key: "extract", display_label: "Lot number", is_required: true, sort_order: 20, client_visible: true, client_sort_order: 20 },
  { placeholder_token: "CLIENT_CONTACT_NAME", field_key: "client", display_label: "Site contact name", is_required: false, sort_order: 30, client_visible: true, client_sort_order: 30 },
];

const ROSTER = [
  { name: "Priya Chandran", email: "certifier@council.test", company: "City Council" },
  { name: "Marcus Webb", email: "planner@council.test", company: "City Council" },
];

const FILE_REQUIREMENTS = [
  { name: "Purchase order", slug: "purchase-order", max_count: 1, required: true, no_duplicates: true, extraction: false, sort_order: 10 },
  { name: "Building plans", slug: "building-plans", max_count: 5, required: true, no_duplicates: true, extraction: false, sort_order: 20 },
];

async function main() {
  const { data: client, error: clientErr } = await supabase
    .from("clients")
    .select("id")
    .eq("slug", "stockland")
    .single();
  if (clientErr || !client) {
    console.error("Stockland seed client not found — run `npm run seed` first.");
    process.exit(1);
  }

  const { data: admin, error: adminErr } = await supabase
    .from("users")
    .select("id")
    .eq("role", "super_admin")
    .limit(1)
    .single();
  if (adminErr || !admin) {
    console.error("No super_admin user — run `npm run seed` first.");
    process.exit(1);
  }

  const { data: existing } = await supabase
    .from("templates")
    .select("id")
    .eq("client_id", client.id)
    .eq("name", TEMPLATE_NAME)
    .is("deleted_at", null)
    .maybeSingle();

  if (existing) {
    console.log(`Template "${TEMPLATE_NAME}" already exists (${existing.id}) — nothing to do.`);
    return;
  }

  // 1. Upload the .docx behind the template
  const docx = readFileSync(path.join(__dirname, "..", "e2e", "fixtures", "sample-pbdb.docx"));
  const { error: uploadErr } = await supabase.storage.from("templates").upload(STORAGE_PATH, docx, {
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    upsert: true,
  });
  if (uploadErr) {
    console.error("Failed to upload template docx:", uploadErr.message);
    process.exit(1);
  }

  // 2. Template row
  const { data: template, error: tErr } = await supabase
    .from("templates")
    .insert({
      client_id: client.id,
      name: TEMPLATE_NAME,
      status: "active",
      storage_path: STORAGE_PATH,
      created_by: admin.id,
    })
    .select("id")
    .single();
  if (tErr || !template) {
    console.error("Failed to insert template:", tErr?.message);
    process.exit(1);
  }
  console.log(`Created template "${TEMPLATE_NAME}" — ${template.id}`);

  // 3. Field mappings
  const { error: fmErr } = await supabase.from("template_field_mappings").insert(
    FIELD_MAPPINGS.map((m) => ({ ...m, template_id: template.id, is_mapped: true, in_template: true, comparison_mode: "exact" }))
  );
  if (fmErr) console.error("field mappings:", fmErr.message);
  else console.log(`  + ${FIELD_MAPPINGS.length} field mappings`);

  // 4. Roster: org-scope stakeholders + template link rows
  const { data: stakeholders, error: sErr } = await supabase
    .from("stakeholders")
    .insert(
      ROSTER.map((r, i) => ({
        scope: "org",
        scope_id: client.id,
        name: r.name,
        email: r.email.toLowerCase(),
        company: r.company,
        is_active: true,
        sort_order: (i + 1) * 10,
      }))
    )
    .select("id");
  if (sErr || !stakeholders) {
    console.error("stakeholders:", sErr?.message);
  } else {
    const { error: linkErr } = await supabase
      .from("template_stakeholders")
      .insert(stakeholders.map((s) => ({ template_id: template.id, stakeholder_id: s.id })));
    if (linkErr) console.error("template_stakeholders:", linkErr.message);
    else console.log(`  + ${stakeholders.length} roster stakeholders (${ROSTER.map((r) => r.email).join(", ")})`);
  }

  // 5. File requirements
  const { error: frErr } = await supabase
    .from("file_requirements")
    .insert(FILE_REQUIREMENTS.map((f) => ({ ...f, template_id: template.id })));
  if (frErr) console.error("file requirements:", frErr.message);
  else console.log(`  + ${FILE_REQUIREMENTS.length} file requirements`);

  console.log("\nDone. Log in as stakeholder@ops.test → /portal/submit — pick 'PBDB — Local Test'.");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
