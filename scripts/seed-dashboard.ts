/**
 * Seeds dashboard-specific data so every panel on /admin/dashboard
 * has at least one item to display visually.
 *
 * Idempotent — uses project_number as the unique key and skips existing rows.
 *
 * Run with:
 *   npx tsx --env-file=.env.local scripts/seed-dashboard.ts
 */
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function main() {
  // ── Resolve required seed users ───────────────────────────────────────────
  const { data: users, error: usersErr } = await supabase
    .from("users")
    .select("id, email, role, org_id")
    .in("email", ["admin@ops.test", "client@ops.test", "consultant@ops.test"]);

  if (usersErr || !users?.length) {
    console.error("Run the main seed first (supabase/seed.ts) — required users not found.");
    process.exit(1);
  }

  const admin    = users.find((u) => u.email === "admin@ops.test");
  const client   = users.find((u) => u.email === "client@ops.test");
  const consultant = users.find((u) => u.email === "consultant@ops.test");

  if (!admin || !client || !consultant) {
    console.error("Missing admin, client, or consultant seed user.");
    process.exit(1);
  }

  const orgId = client.org_id as string;
  const daysAgo = (n: number) =>
    new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

  // ── 1. Unassigned submission ───────────────────────────────────────────────
  // Already seeded as OPS-0001 in main seed — no need to duplicate.
  // Re-check it exists and is unassigned.
  const { data: unassigned } = await supabase
    .from("projects")
    .select("id")
    .eq("project_number", "OPS-0001")
    .is("deleted_at", null)
    .maybeSingle();

  if (unassigned) {
    console.log("✓  Panel 1 (unassigned)   — OPS-0001 exists");
  } else {
    const { error } = await supabase.from("projects").insert({
      org_id: orgId,
      submitted_by: client.id,
      status: "submitted",
      project_number: "OPS-0001",
      po_number: "PO-2024-001",
      site_address: "1 Seed Street, Testville NSW 2000",
      expected_delivery_date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    });
    console.log(error ? `✗  Panel 1 insert failed: ${error.message}` : "✓  Panel 1 (unassigned)   — OPS-0001 created");
  }

  // ── 2. Overdue in-flight project ──────────────────────────────────────────
  const { data: existingOverdue } = await supabase
    .from("projects")
    .select("id")
    .eq("project_number", "OPS-D001")
    .is("deleted_at", null)
    .maybeSingle();

  if (existingOverdue) {
    console.log("✓  Panel 2 (overdue)      — OPS-D001 exists");
  } else {
    const { error } = await supabase.from("projects").insert({
      org_id: orgId,
      submitted_by: client.id,
      assigned_consultant_id: consultant.id,
      status: "in_progress",
      project_number: "OPS-D001",
      po_number: "PO-DASH-001",
      site_address: "42 Overdue Lane, Lateville NSW 2001",
      expected_delivery_date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      created_at: daysAgo(10),
    });
    console.log(error ? `✗  Panel 2 insert failed: ${error.message}` : "✓  Panel 2 (overdue)      — OPS-D001 created (due 3 days ago)");
  }

  // ── 3. Payment override pending ───────────────────────────────────────────
  const { data: existingOverride } = await supabase
    .from("projects")
    .select("id")
    .eq("project_number", "OPS-D002")
    .is("deleted_at", null)
    .maybeSingle();

  let overrideProjectId: string | null = existingOverride?.id ?? null;

  if (overrideProjectId) {
    console.log("✓  Panel 3 (override)     — OPS-D002 exists");
  } else {
    const { data: proj, error } = await supabase
      .from("projects")
      .insert({
        org_id: orgId,
        submitted_by: client.id,
        assigned_consultant_id: consultant.id,
        status: "assigned",
        project_number: "OPS-D002",
        po_number: "PO-DASH-002",
        site_address: "7 Override Close, Bypasston NSW 2002",
        payment_override: true,
        payment_override_reason: "Client urgently requested report before payment could be processed.",
        payment_override_at: daysAgo(2),
        credit_deducted: false,
        expected_delivery_date: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        created_at: daysAgo(5),
      })
      .select("id")
      .single();
    overrideProjectId = proj?.id ?? null;
    console.log(error ? `✗  Panel 3 insert failed: ${error.message}` : "✓  Panel 3 (override)     — OPS-D002 created");
  }

  // ── 4. Awaiting stakeholder response ──────────────────────────────────────
  const { data: existingDispatched } = await supabase
    .from("projects")
    .select("id")
    .eq("project_number", "OPS-D003")
    .is("deleted_at", null)
    .maybeSingle();

  let dispatchedId: string | null = existingDispatched?.id ?? null;

  if (dispatchedId) {
    console.log("✓  Panel 4 (stakeholder)  — OPS-D003 exists");
  } else {
    const { data: proj, error } = await supabase
      .from("projects")
      .insert({
        org_id: orgId,
        submitted_by: client.id,
        assigned_consultant_id: consultant.id,
        status: "dispatched",
        project_number: "OPS-D003",
        po_number: "PO-DASH-003",
        site_address: "99 Pending Place, Awaitingston NSW 2003",
        review_cycle: 1,
        first_response_at: daysAgo(3),
        review_buffer_fired_at: daysAgo(2),
        credit_deducted: true,
        expected_delivery_date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        created_at: daysAgo(7),
      })
      .select("id")
      .single();
    dispatchedId = proj?.id ?? null;
    console.log(error ? `✗  Panel 4 project insert failed: ${error.message}` : "✓  Panel 4 (stakeholder)  — OPS-D003 created");
  }

  // Ensure there's a pending stakeholder_review for OPS-D003
  if (dispatchedId) {
    const { data: existingReview } = await supabase
      .from("stakeholder_reviews")
      .select("id")
      .eq("project_id", dispatchedId)
      .eq("status", "pending")
      .maybeSingle();

    if (!existingReview) {
      // Use a predictable but unique token for the seed row.
      // expires_at in the past → simulates an expired fresh token.
      const { error } = await supabase.from("stakeholder_reviews").upsert(
        {
          project_id: dispatchedId,
          review_cycle: 1,
          stakeholder_email: "certifier@example.com",
          stakeholder_name: "John Certifier",
          token: `seed-dash-token-${Date.now()}`,
          dispatched_at: daysAgo(7),
          expires_at: daysAgo(2),           // expired — exactly what surfaces on dashboard
          fresh_token_sent_at: daysAgo(2),  // buffer sent a fresh token that also expired
          status: "pending",
        },
        { onConflict: "project_id,review_cycle,stakeholder_email" }
      );
      console.log(error ? `✗  Stakeholder review insert failed: ${error.message}` : "   ↳ Pending stakeholder_review (expired fresh token) created for OPS-D003");
    }
  }

  // ── 5. System error notification ──────────────────────────────────────────
  const { count: errorCount } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("type", "system_error");

  if ((errorCount ?? 0) > 0) {
    console.log("✓  Panel 5 (system error) — notification exists");
  } else {
    const { error } = await supabase.from("notifications").insert({
      recipient_id: admin.id,
      type: "system_error",
      message: "Gotenberg PDF conversion failed for project OPS-D003 (timeout after 60s). Retry or re-trigger conversion manually.",
      project_id: dispatchedId,
      is_read: false,
    });
    console.log(error ? `✗  Panel 5 insert failed: ${error.message}` : "✓  Panel 5 (system error) — notification created");
  }

  console.log(`
Done. Visit /admin/dashboard to see all panels populated.
All panels:
  1. Unassigned submissions  — OPS-0001 (submitted, no consultant)
  2. Overdue projects        — OPS-D001 (in_progress, due 3 days ago)
  3. Override — pmt pending  — OPS-D002 (assigned, payment_override=true)
  4. Awaiting stakeholder    — OPS-D003 (dispatched, buffer fired, pending review)
  5. System error            — Gotenberg timeout notification
`);
}

main().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
