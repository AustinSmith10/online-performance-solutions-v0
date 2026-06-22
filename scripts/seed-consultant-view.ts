/**
 * Seeds a realistic project visible on the consultant workspace and profile,
 * so every section of /ops/projects/[id] has data to render:
 *
 *  - Client contact (submitted_by → client@ops.test)
 *  - Submitted details (EXTRACT_ / CLIENT_ tokens in extracted_fields)
 *  - Organisation values (ORG_ tokens written to org_config)
 *  - System values (project_number set, PBDB record created so dates compute)
 *  - PBDB version history (v1 generated, v2 QA-corrected)
 *  - PBDR file (delivered)
 *
 * Idempotent — keyed on project_number "SEED-CV-01". Re-running clears
 * existing files for that project and rewrites them.
 *
 * Run with:
 *   npx tsx --env-file=.env.local scripts/seed-consultant-view.ts
 */
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const PROJECT_NUMBER = "SEED-CV-01";

async function main() {
  // ── 1. Resolve seed users ─────────────────────────────────────────────────
  const { data: users, error: usersErr } = await supabase
    .from("users")
    .select("id, email, role, org_id")
    .in("email", ["admin@ops.test", "client@ops.test", "consultant@ops.test"]);

  if (usersErr || !users?.length) {
    console.error("Seed users not found — run supabase/seed.ts first.");
    process.exit(1);
  }

  const admin      = users.find((u) => u.email === "admin@ops.test");
  const client     = users.find((u) => u.email === "client@ops.test");
  const consultant = users.find((u) => u.email === "consultant@ops.test");

  if (!admin || !client || !consultant) {
    console.error("Missing admin, client, or consultant user.");
    process.exit(1);
  }

  const orgId = client.org_id as string;
  console.log(`Using org ${orgId} (from client@ops.test)`);

  // ── 2. Write ORG_ config to the organisation ──────────────────────────────
  const { error: orgErr } = await supabase
    .from("organisations")
    .update({
      org_config: {
        ORG_CERTIFIER_NAME: "Jane Smith",
        ORG_CERTIFIER_LICENCE: "BPB-12345",
        ORG_CERTIFIER_COMPANY: "Certified Building Practitioners Pty Ltd",
        ORG_CERTIFIER_EMAIL: "jane.smith@cbp.com.au",
      },
    })
    .eq("id", orgId);

  if (orgErr) {
    console.error("Failed to update org_config:", orgErr.message);
    process.exit(1);
  }
  console.log("✓  org_config written");

  // ── 3. Find or create the project ─────────────────────────────────────────
  const { data: existing } = await supabase
    .from("projects")
    .select("id")
    .eq("project_number", PROJECT_NUMBER)
    .is("deleted_at", null)
    .maybeSingle();

  let projectId: string;

  const extractedFields = {
    EXTRACT_ADDRESS: "14 Acacia Drive, Riverstone NSW 2765",
    EXTRACT_LOT_NO: "Lot 214",
    EXTRACT_DP_NO: "DP 1234567",
    EXTRACT_DEV_NAME: "Riverstone Estate",
    EXTRACT_TRUSTEE: "Stockland Trust Group",
    EXTRACT_RAINFALL_INTENSITY: "I5 = 130 mm/hr",
    CLIENT_CONTACT_NAME: "Bob Johnson",
    CLIENT_CONTACT_PHONE: "0412 345 678",
  };

  if (existing?.id) {
    projectId = existing.id;
    // Update fields in case they've changed
    await supabase
      .from("projects")
      .update({
        status: "in_progress",
        extracted_fields: extractedFields,
        assigned_consultant_id: consultant.id,
        submitted_by: client.id,
        expected_delivery_date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10),
      })
      .eq("id", projectId);
    console.log(`✓  project exists — updated (${projectId.slice(0, 8)})`);
  } else {
    const { data: inserted, error: insertErr } = await supabase
      .from("projects")
      .insert({
        org_id: orgId,
        submitted_by: client.id,
        assigned_consultant_id: consultant.id,
        status: "in_progress",
        project_number: PROJECT_NUMBER,
        po_number: "PO-2025-0042",
        source: "portal",
        review_cycle: 1,
        credit_deducted: false,
        payment_override: false,
        expected_delivery_date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10),
        extracted_fields: extractedFields,
      })
      .select("id")
      .single();

    if (insertErr || !inserted) {
      console.error("Failed to insert project:", insertErr?.message);
      process.exit(1);
    }
    projectId = inserted.id as string;
    console.log(`✓  project created (${projectId.slice(0, 8)})`);
  }

  // ── 4. Clear existing file records for this project ───────────────────────
  await supabase.from("project_files").delete().eq("project_id", projectId);
  console.log("✓  cleared old file records");

  // ── 5. Seed PBDB files (v1 generated, v2 QA-corrected) ───────────────────
  const pbdbV1Name = `${PROJECT_NUMBER}-S PBDB R0 14 Acacia Drive Riverstone 2025 01 15.docx`;
  const pbdbV2Name = `${PROJECT_NUMBER}-S PBDB R1 14 Acacia Drive Riverstone 2025 01 16.docx`;

  const { error: pbdbErr } = await supabase.from("project_files").insert([
    {
      project_id: projectId,
      file_type: "pbdb",
      original_filename: pbdbV1Name,
      storage_path: `seed/${orgId}/${projectId}/pbdb/${pbdbV1Name}`,
      uploaded_by: admin.id,
      version: 1,
      created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      project_id: projectId,
      file_type: "pbdb",
      original_filename: pbdbV2Name,
      storage_path: `seed/${orgId}/${projectId}/pbdb/${pbdbV2Name}`,
      uploaded_by: consultant.id,
      version: 2,
      created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ]);

  if (pbdbErr) {
    console.error("Failed to insert PBDB files:", pbdbErr.message);
    process.exit(1);
  }
  console.log("✓  PBDB v1 + v2 seeded");

  // ── 6. Seed PBDR file (so the PBDR section renders) ──────────────────────
  const pbdrName = `${PROJECT_NUMBER}-S PBDR R0 14 Acacia Drive Riverstone 2025 01 17.pdf`;

  const { error: pbdrErr } = await supabase.from("project_files").insert({
    project_id: projectId,
    file_type: "pbdr",
    original_filename: pbdrName,
    storage_path: `seed/${orgId}/${projectId}/pbdr/${pbdrName}`,
    uploaded_by: admin.id,
    version: 1,
    created_at: new Date().toISOString(),
  });

  if (pbdrErr) {
    console.error("Failed to insert PBDR file:", pbdrErr.message);
    process.exit(1);
  }
  console.log("✓  PBDR v1 seeded");

  // ── 7. Seed a second project — revision_required with rejection comments ──
  const REV_NUMBER = "SEED-CV-02";

  const { data: existingRev } = await supabase
    .from("projects")
    .select("id")
    .eq("project_number", REV_NUMBER)
    .is("deleted_at", null)
    .maybeSingle();

  let revProjectId: string;

  const revFields = {
    EXTRACT_ADDRESS: "7 Harbour View Crescent, Wentworth Point NSW 2127",
    EXTRACT_LOT_NO: "Lot 88",
    EXTRACT_DP_NO: "DP 9876543",
    EXTRACT_DEV_NAME: "Wentworth Point Marina",
    EXTRACT_TRUSTEE: "Stockland Trust Group",
    EXTRACT_RAINFALL_INTENSITY: "I5 = 115 mm/hr",
  };

  if (existingRev?.id) {
    revProjectId = existingRev.id;
    await supabase
      .from("projects")
      .update({
        status: "revision_required",
        review_cycle: 1,
        extracted_fields: revFields,
        assigned_consultant_id: consultant.id,
        submitted_by: client.id,
        expected_delivery_date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10),
      })
      .eq("id", revProjectId);
    console.log(`✓  revision project exists — updated (${revProjectId.slice(0, 8)})`);
  } else {
    const { data: revInserted, error: revInsertErr } = await supabase
      .from("projects")
      .insert({
        org_id: orgId,
        submitted_by: client.id,
        assigned_consultant_id: consultant.id,
        status: "revision_required",
        project_number: REV_NUMBER,
        po_number: "PO-2025-0043",
        source: "portal",
        review_cycle: 1,
        credit_deducted: false,
        payment_override: false,
        expected_delivery_date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10),
        extracted_fields: revFields,
      })
      .select("id")
      .single();

    if (revInsertErr || !revInserted) {
      console.error("Failed to insert revision project:", revInsertErr?.message);
      process.exit(1);
    }
    revProjectId = revInserted.id as string;
    console.log(`✓  revision project created (${revProjectId.slice(0, 8)})`);
  }

  // Clear and re-seed files for revision project
  await supabase.from("project_files").delete().eq("project_id", revProjectId);

  const revPbdbName = `${REV_NUMBER}-S PBDB R0 7 Harbour View Crescent Wentworth Point 2025 01 10.docx`;
  await supabase.from("project_files").insert({
    project_id: revProjectId,
    file_type: "pbdb",
    original_filename: revPbdbName,
    storage_path: `seed/${orgId}/${revProjectId}/pbdb/${revPbdbName}`,
    uploaded_by: admin.id,
    version: 1,
    created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
  });
  console.log("✓  revision PBDB v1 seeded");

  // ── 8. Seed stakeholder_reviews with rejection comments ───────────────────
  const respondedAt1 = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
  const respondedAt2 = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

  const reviews = [
    {
      project_id: revProjectId,
      review_cycle: 1,
      stakeholder_email: "michael.chen@stockland.com.au",
      stakeholder_name: "Michael Chen",
      token: `seed-token-rev-001-${revProjectId.slice(0, 8)}`,
      dispatched_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
      expires_at: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
      fresh_token_sent_at: null,
      status: "rejected_with_comments",
      comments:
        "The lot number on the cover page reads Lot 88 but the survey plan attached shows Lot 89. " +
        "Please correct this before resubmitting. Also, Section 3.2 references the incorrect DP number — " +
        "it should be DP 9876543 not DP 9876000 as currently shown.",
      responded_at: respondedAt1,
      waive_reason: null,
      waived_at: null,
    },
    {
      project_id: revProjectId,
      review_cycle: 1,
      stakeholder_email: "sarah.wong@stockland.com.au",
      stakeholder_name: "Sarah Wong",
      token: `seed-token-rev-002-${revProjectId.slice(0, 8)}`,
      dispatched_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
      expires_at: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
      fresh_token_sent_at: null,
      status: "rejected_with_comments",
      comments:
        "Rainfall intensity value on page 4 does not match the IFD data for the site. " +
        "Our records show I5 = 115 mm/hr for this catchment but the document states 130 mm/hr. " +
        "Please update and re-check all downstream calculations that reference this figure.",
      responded_at: respondedAt2,
      waive_reason: null,
      waived_at: null,
    },
  ];

  const { error: reviewsErr } = await supabase
    .from("stakeholder_reviews")
    .upsert(reviews, { onConflict: "project_id,review_cycle,stakeholder_email" });

  if (reviewsErr) {
    console.error("Failed to insert stakeholder reviews:", reviewsErr.message);
    process.exit(1);
  }
  console.log("✓  2 rejection reviews seeded (Michael Chen + Sarah Wong)");

  // ── 9. Seed a third project — 2 review cycles, mixed responses ───────────
  const HISTORY_NUMBER = "SEED-CV-03";

  const { data: existingHistory } = await supabase
    .from("projects")
    .select("id")
    .eq("project_number", HISTORY_NUMBER)
    .is("deleted_at", null)
    .maybeSingle();

  let histProjectId: string;

  const histFields = {
    EXTRACT_ADDRESS: "23 Meridian Boulevard, Docklands VIC 3008",
    EXTRACT_LOT_NO: "Lot 12",
    EXTRACT_DP_NO: "DP 1234567",
    EXTRACT_DEV_NAME: "Docklands Marina Precinct",
    EXTRACT_TRUSTEE: "GPT Group",
    EXTRACT_RAINFALL_INTENSITY: "I5 = 98 mm/hr",
  };

  if (existingHistory?.id) {
    histProjectId = existingHistory.id;
    await supabase
      .from("projects")
      .update({
        status: "revision_required",
        review_cycle: 2,
        extracted_fields: histFields,
        assigned_consultant_id: consultant.id,
        submitted_by: client.id,
        expected_delivery_date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10),
      })
      .eq("id", histProjectId);
    console.log(`✓  history project exists — updated (${histProjectId.slice(0, 8)})`);
  } else {
    const { data: histInserted, error: histInsertErr } = await supabase
      .from("projects")
      .insert({
        org_id: orgId,
        submitted_by: client.id,
        assigned_consultant_id: consultant.id,
        status: "revision_required",
        project_number: HISTORY_NUMBER,
        po_number: "PO-2025-0061",
        source: "portal",
        review_cycle: 2,
        credit_deducted: false,
        payment_override: false,
        expected_delivery_date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10),
        extracted_fields: histFields,
      })
      .select("id")
      .single();

    if (histInsertErr || !histInserted) {
      console.error("Failed to insert history project:", histInsertErr?.message);
      process.exit(1);
    }
    histProjectId = histInserted.id as string;
    console.log(`✓  history project created (${histProjectId.slice(0, 8)})`);
  }

  // Clear and re-seed PBDB files for history project
  await supabase.from("project_files").delete().eq("project_id", histProjectId);

  const histPbdb1 = `${HISTORY_NUMBER}-S PBDB R0 23 Meridian Boulevard Docklands 2025 02 01.docx`;
  const histPbdb2 = `${HISTORY_NUMBER}-S PBDB R1 23 Meridian Boulevard Docklands 2025 02 08.docx`;

  await supabase.from("project_files").insert([
    {
      project_id: histProjectId,
      file_type: "pbdb",
      original_filename: histPbdb1,
      storage_path: `seed/${orgId}/${histProjectId}/pbdb/${histPbdb1}`,
      uploaded_by: admin.id,
      version: 1,
      created_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      project_id: histProjectId,
      file_type: "pbdb",
      original_filename: histPbdb2,
      storage_path: `seed/${orgId}/${histProjectId}/pbdb/${histPbdb2}`,
      uploaded_by: consultant.id,
      version: 2,
      created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ]);
  console.log("✓  history PBDB v1 + v2 seeded");

  // Seed 2 cycles of stakeholder reviews
  const histReviews = [
    // ── Cycle 1 (PBDB v1) — one approved, one rejected ──────────────────────
    {
      project_id: histProjectId,
      review_cycle: 1,
      stakeholder_email: "james.thornton@gptgroup.com.au",
      stakeholder_name: "James Thornton",
      token: `seed-token-hist-c1-001-${histProjectId.slice(0, 8)}`,
      dispatched_at: new Date(Date.now() - 13 * 24 * 60 * 60 * 1000).toISOString(),
      expires_at: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
      fresh_token_sent_at: null,
      status: "approved_without_comments",
      comments: null,
      responded_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      waive_reason: null,
      waived_at: null,
    },
    {
      project_id: histProjectId,
      review_cycle: 1,
      stakeholder_email: "rachel.park@gptgroup.com.au",
      stakeholder_name: "Rachel Park",
      token: `seed-token-hist-c1-002-${histProjectId.slice(0, 8)}`,
      dispatched_at: new Date(Date.now() - 13 * 24 * 60 * 60 * 1000).toISOString(),
      expires_at: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
      fresh_token_sent_at: null,
      status: "rejected_with_comments",
      comments:
        "Section 4.1 references Flood Overlay FO-3 but the current planning scheme map for " +
        "this precinct shows FO-2. The drainage calculations in Appendix B appear to use the " +
        "wrong overlay extents as a result. Please review and update before resubmission.",
      responded_at: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString(),
      waive_reason: null,
      waived_at: null,
    },
    // ── Cycle 2 (PBDB v2) — one approved with notes, one rejected ───────────
    {
      project_id: histProjectId,
      review_cycle: 2,
      stakeholder_email: "james.thornton@gptgroup.com.au",
      stakeholder_name: "James Thornton",
      token: `seed-token-hist-c2-001-${histProjectId.slice(0, 8)}`,
      dispatched_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      expires_at: new Date(Date.now() + 9 * 24 * 60 * 60 * 1000).toISOString(),
      fresh_token_sent_at: null,
      status: "approved_with_comments",
      comments:
        "The flood overlay reference has been corrected — thank you. Minor note: Figure 3 " +
        "caption still reads FO-3, though the body text has been updated. Please amend the " +
        "caption if a further revision is made.",
      responded_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      waive_reason: null,
      waived_at: null,
    },
    {
      project_id: histProjectId,
      review_cycle: 2,
      stakeholder_email: "rachel.park@gptgroup.com.au",
      stakeholder_name: "Rachel Park",
      token: `seed-token-hist-c2-002-${histProjectId.slice(0, 8)}`,
      dispatched_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      expires_at: new Date(Date.now() + 9 * 24 * 60 * 60 * 1000).toISOString(),
      fresh_token_sent_at: null,
      status: "rejected_with_comments",
      comments:
        "The flood overlay reference in the body text has been updated to FO-2, however " +
        "Appendix B (Drainage Calculations) still uses the FO-3 extents for the catchment " +
        "area calculation on page B-7. The reported runoff volume is therefore still incorrect. " +
        "Please recalculate using the FO-2 boundary and resubmit.",
      responded_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      waive_reason: null,
      waived_at: null,
    },
  ];

  const { error: histReviewsErr } = await supabase
    .from("stakeholder_reviews")
    .upsert(histReviews, { onConflict: "project_id,review_cycle,stakeholder_email" });

  if (histReviewsErr) {
    console.error("Failed to insert history reviews:", histReviewsErr.message);
    process.exit(1);
  }
  console.log("✓  4 reviews seeded across 2 cycles (James Thornton + Rachel Park)");

  // ── Done ──────────────────────────────────────────────────────────────────
  console.log(`
Done. Log in as consultant@ops.test and visit:

── Project 1 — in_progress (full token context) ──
  /ops/projects/${projectId}

── Project 2 — revision_required, single cycle (2 rejections) ──
  /ops/projects/${revProjectId}

── Project 3 — revision_required, 2-cycle history ──
  /ops/projects/${histProjectId}

  Cycle 1 · PBDB v1 — James Thornton: Approved / Rachel Park: Rejected (flood overlay)
  Cycle 2 · PBDB v2 — James Thornton: Approved with notes / Rachel Park: Rejected (appendix)

Note: PBDB/PBDR download links will 404 — seed uses dummy storage paths.
`);
}

main().catch((e) => { console.error(e); process.exit(1); });
