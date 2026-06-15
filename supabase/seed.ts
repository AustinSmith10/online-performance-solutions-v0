import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function seed() {
  console.log("Seeding OPS database...");

  // ── Orgs ───────────────────────────────────────────────────────────────────
  const { data: stockland, error: orgError } = await supabase
    .from("organisations")
    .upsert(
      {
        name: "Stockland",
        slug: "stockland",
        payment_method: "credit_deduction",
        credit_balance: 100,
        delivery_working_days: 5,
        state_territory: "NSW",
      },
      { onConflict: "slug" }
    )
    .select()
    .single();

  if (orgError || !stockland) {
    console.error("Failed to upsert org:", orgError?.message);
    return;
  }
  console.log("Org ready:", stockland.name, stockland.id);

  // ── Remove stale real-domain accounts ──────────────────────────────────────
  const staleEmails = [
    "fire@ddeg.com.au",
    "consultant@ddeg.com.au",
    "client@stockland.com.au",
  ];
  const { data: allUsers } = await supabase.auth.admin.listUsers();
  for (const stale of staleEmails) {
    const match = allUsers?.users.find((u) => u.email === stale);
    if (match) {
      await supabase.auth.admin.deleteUser(match.id);
      console.log(`Removed stale user: ${stale}`);
    }
  }

  // ── Second org ─────────────────────────────────────────────────────────────
  const { data: meridian, error: meridianError } = await supabase
    .from("organisations")
    .upsert(
      {
        name: "Meridian Group",
        slug: "meridian-group",
        payment_method: "deferred",
        credit_balance: 0,
        delivery_working_days: 5,
        state_territory: "VIC",
      },
      { onConflict: "slug" }
    )
    .select()
    .single();

  if (meridianError || !meridian) {
    console.error("Failed to upsert Meridian org:", meridianError?.message);
    return;
  }
  console.log("Org ready:", meridian.name, meridian.id);

  // ── Users ──────────────────────────────────────────────────────────────────
  type UserSpec = {
    email: string;
    role: "super_admin" | "consultant" | "client";
    firstName: string;
    lastName: string;
    orgId: string | null;
    availability?: "available" | "on_leave" | "at_capacity";
  };

  const testUsers: UserSpec[] = [
    // Super admin
    {
      email: "admin@ops.test",
      role: "super_admin",
      firstName: "Admin",
      lastName: "User",
      orgId: null,
    },
    // Consultants — varied availability for realistic assignment testing
    {
      email: "consultant@ops.test",
      role: "consultant",
      firstName: "Test",
      lastName: "Consultant",
      orgId: null,
      availability: "available",
    },
    {
      email: "consultant2@ops.test",
      role: "consultant",
      firstName: "Sarah",
      lastName: "Chen",
      orgId: null,
      availability: "available",
    },
    {
      email: "consultant3@ops.test",
      role: "consultant",
      firstName: "Marcus",
      lastName: "Webb",
      orgId: null,
      availability: "on_leave",
    },
    {
      email: "consultant4@ops.test",
      role: "consultant",
      firstName: "Priya",
      lastName: "Nair",
      orgId: null,
      availability: "at_capacity",
    },
    {
      email: "consultant5@ops.test",
      role: "consultant",
      firstName: "James",
      lastName: "O'Brien",
      orgId: null,
      availability: "available",
    },
    // Clients — Stockland
    {
      email: "client@ops.test",
      role: "client",
      firstName: "Test",
      lastName: "Client",
      orgId: stockland.id,
    },
    {
      email: "client2@ops.test",
      role: "client",
      firstName: "Emma",
      lastName: "Davis",
      orgId: stockland.id,
    },
    {
      email: "client3@ops.test",
      role: "client",
      firstName: "Ryan",
      lastName: "Thompson",
      orgId: stockland.id,
    },
    // Clients — Meridian Group
    {
      email: "client4@ops.test",
      role: "client",
      firstName: "Alex",
      lastName: "Kim",
      orgId: meridian.id,
    },
    {
      email: "client5@ops.test",
      role: "client",
      firstName: "Sophie",
      lastName: "Laurent",
      orgId: meridian.id,
    },
  ];

  // Track seeded user IDs keyed by email
  const seededIds: Record<string, string> = {};

  const { data: existingAuth } = await supabase.auth.admin.listUsers();

  for (const u of testUsers) {
    const alreadyExists = existingAuth?.users.find((a) => a.email === u.email);

    let userId: string;

    if (alreadyExists) {
      console.log(`Auth user already exists: ${u.email}`);
      userId = alreadyExists.id;
    } else {
      const { data: authUser, error: authError } =
        await supabase.auth.admin.createUser({
          email: u.email,
          password: "Ops@TestPass1!",
          email_confirm: true,
          app_metadata: { role: u.role, org_id: u.orgId },
          user_metadata: { profile_complete: true },
        });

      if (authError || !authUser.user) {
        console.error(`Failed to create auth user ${u.email}:`, authError?.message);
        continue;
      }
      userId = authUser.user.id;
    }

    const { error: dbError } = await supabase.from("users").upsert(
      {
        id: userId,
        email: u.email,
        first_name: u.firstName,
        last_name: u.lastName,
        phone: "0400000000",
        company_role: u.role,
        state_territory: "NSW",
        role: u.role,
        org_id: u.orgId,
        availability: u.availability ?? "available",
        profile_complete: true,
        totp_enabled: false,
        invited_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

    if (dbError) {
      console.error(`Failed to upsert users row for ${u.email}:`, dbError.message);
    } else {
      console.log(`Ready: ${u.email} (${u.role}${u.availability ? `, ${u.availability}` : ""})`);
      seededIds[u.email] = userId;
    }
  }

  // ── Dummy project ──────────────────────────────────────────────────────────
  // Submitted, unassigned — lets the Super Admin test the full assign/reassign flow.
  const submittedById = seededIds["client@ops.test"];
  if (submittedById) {
    const { data: existing } = await supabase
      .from("projects")
      .select("id")
      .eq("project_number", "OPS-0001")
      .maybeSingle();

    if (existing) {
      console.log("Dummy project OPS-0001 already exists — skipping");
    } else {
      const { error: projError } = await supabase.from("projects").insert({
        org_id: stockland.id,
        submitted_by: submittedById,
        status: "submitted",
        project_number: "OPS-0001",
        po_number: "PO-2024-001",
        delivery_recipient_email: "client@ops.test",
        expected_delivery_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10),
      });

      if (projError) {
        console.error("Failed to insert dummy project:", projError.message);
      } else {
        console.log("Dummy project OPS-0001 created (status: submitted, unassigned)");
      }
    }
  } else {
    console.warn("Could not find client@ops.test — skipping dummy project");
  }

  // ── Delivered / complete projects — for Report History testing ────────────
  const deliveredProjects: Array<{
    project_number: string;
    po_number: string;
    address: string;
    status: "delivered" | "complete";
    daysAgo: number;
  }> = [
    { project_number: "OPS-0002", po_number: "PO-2024-002", address: "12 Rosewood Crescent, Halcyon Promenade", status: "complete",  daysAgo: 45 },
    { project_number: "OPS-0003", po_number: "PO-2024-003", address: "7 Banksia Drive, Halcyon Edgebrook",     status: "complete",  daysAgo: 30 },
    { project_number: "OPS-0004", po_number: "PO-2024-004", address: "3 Wattle Way, Halcyon Vista",            status: "delivered", daysAgo: 14 },
  ];

  // ── Overdue project ────────────────────────────────────────────────────────
  const { data: existingOverdue } = await supabase
    .from("projects")
    .select("id")
    .eq("project_number", "OPS-0005")
    .maybeSingle();

  if (existingOverdue) {
    console.log("Overdue project OPS-0005 already exists — skipping");
  } else {
    const { error: overdueErr } = await supabase.from("projects").insert({
      org_id: stockland.id,
      submitted_by: submittedById,
      status: "in_review",
      project_number: "OPS-0005",
      po_number: "PO-2024-005",
      expected_delivery_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10),
      extracted_fields: { CLIENT_ADDRESS: "55 Paperbark Lane, Halcyon Dales" },
    });
    if (overdueErr) {
      console.error("Failed to insert overdue project:", overdueErr.message);
    } else {
      console.log("Overdue project OPS-0005 created (status: in_review, due 7 days ago)");
    }
  }

  for (const p of deliveredProjects) {
    const { data: existing } = await supabase
      .from("projects")
      .select("id")
      .eq("project_number", p.project_number)
      .maybeSingle();

    if (existing) {
      console.log(`Project ${p.project_number} already exists — skipping`);
      continue;
    }

    const submittedAt = new Date(Date.now() - p.daysAgo * 24 * 60 * 60 * 1000).toISOString();
    const deliveryDate = new Date(Date.now() - (p.daysAgo - 5) * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const { error: projError } = await supabase.from("projects").insert({
      org_id: stockland.id,
      submitted_by: submittedById,
      status: p.status,
      project_number: p.project_number,
      po_number: p.po_number,
      expected_delivery_date: deliveryDate,
      credit_deducted: true,
      extracted_fields: { CLIENT_ADDRESS: p.address },
      created_at: submittedAt,
      updated_at: submittedAt,
    });

    if (projError) {
      console.error(`Failed to insert project ${p.project_number}:`, projError.message);
    } else {
      console.log(`Project ${p.project_number} created (status: ${p.status})`);
    }
  }

  // ── Audit log seed data ────────────────────────────────────────────────────
  const adminId = seededIds["admin@ops.test"] ?? null;
  const consultantId = seededIds["consultant@ops.test"] ?? null;
  const clientId = seededIds["client@ops.test"] ?? null;

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("project_number", "OPS-0001")
    .maybeSingle();
  const projectId = project?.id ?? null;

  // Check if audit seed already exists
  const { count } = await supabase
    .from("audit_log")
    .select("*", { count: "exact", head: true })
    .eq("event_type", "audit.seed");

  if ((count ?? 0) > 0) {
    console.log("Audit log already seeded — skipping");
  } else {
    const now = new Date();
    const ago = (mins: number) => new Date(now.getTime() - mins * 60 * 1000).toISOString();

    const auditEntries = [
      { event_type: "auth.login", actor_id: adminId, actor_email: "admin@ops.test", project_id: null, org_id: null, metadata: { role: "super_admin" }, created_at: ago(120) },
      { event_type: "auth.login", actor_id: clientId, actor_email: "client@ops.test", project_id: null, org_id: stockland.id, metadata: { role: "client" }, created_at: ago(110) },
      { event_type: "org.created", actor_id: adminId, actor_email: "admin@ops.test", project_id: null, org_id: stockland.id, metadata: { name: "Stockland", payment_method: "credit_deduction" }, created_at: ago(100) },
      { event_type: "org.updated", actor_id: adminId, actor_email: "admin@ops.test", project_id: null, org_id: stockland.id, metadata: { name: "Stockland", payment_method: "credit_deduction" }, created_at: ago(90) },
      { event_type: "credit.top_up", actor_id: adminId, actor_email: "admin@ops.test", project_id: null, org_id: stockland.id, metadata: { amount: 100, balance_after: 100, notes: "Initial credit allocation" }, created_at: ago(80) },
      { event_type: "assignment.created", actor_id: adminId, actor_email: "admin@ops.test", project_id: projectId, org_id: stockland.id, metadata: { consultant_id: consultantId, consultant_name: "Test Consultant" }, created_at: ago(70) },
      { event_type: "auth.login", actor_id: consultantId, actor_email: "consultant@ops.test", project_id: null, org_id: null, metadata: { role: "consultant" }, created_at: ago(60) },
      { event_type: "credit.deduction", actor_id: adminId, actor_email: "admin@ops.test", project_id: projectId, org_id: stockland.id, metadata: { balance_after: 99 }, created_at: ago(50) },
      { event_type: "payment.override_applied", actor_id: adminId, actor_email: "admin@ops.test", project_id: projectId, org_id: stockland.id, metadata: { reason: "Client requested expedited processing", project_number: "OPS-0001" }, created_at: ago(40) },
      { event_type: "payment.override_reconciled", actor_id: adminId, actor_email: "admin@ops.test", project_id: projectId, org_id: stockland.id, metadata: { project_number: "OPS-0001" }, created_at: ago(30) },
      { event_type: "org.frozen", actor_id: adminId, actor_email: "admin@ops.test", project_id: null, org_id: stockland.id, metadata: { source: "organisations" }, created_at: ago(20) },
      { event_type: "org.unfrozen", actor_id: adminId, actor_email: "admin@ops.test", project_id: null, org_id: stockland.id, metadata: { source: "organisations" }, created_at: ago(10) },
      { event_type: "auth.login", actor_id: adminId, actor_email: "admin@ops.test", project_id: null, org_id: null, metadata: { role: "super_admin" }, created_at: ago(5) },
      // Sentinel — used to detect whether audit seed has been run
      { event_type: "audit.seed", actor_id: null, actor_email: null, project_id: null, org_id: null, metadata: { note: "seed script marker" }, created_at: ago(0) },
    ];

    const { error: auditErr } = await supabase.from("audit_log").insert(auditEntries);
    if (auditErr) {
      console.error("Failed to seed audit_log:", auditErr.message);
    } else {
      console.log(`Seeded ${auditEntries.length} audit log entries`);
    }
  }

  // ── Recovery bin seed ──────────────────────────────────────────────────────
  // Soft-deleted projects across two orgs and multiple clients to test
  // the client recovery bin (own-org filter) and admin recovery bin (all orgs).
  const { count: recoveryCount } = await supabase
    .from("projects")
    .select("*", { count: "exact", head: true })
    .not("deleted_at", "is", null);

  if ((recoveryCount ?? 0) > 0) {
    console.log("Recovery bin already seeded — skipping");
  } else {
    const client1Id = seededIds["client@ops.test"];
    const client2Id = seededIds["client2@ops.test"];
    const client4Id = seededIds["client4@ops.test"];
    const client5Id = seededIds["client5@ops.test"];

    const daysAgo = (n: number) =>
      new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

    const recoveryProjects = [
      // Stockland — client1: draft deleted 2 days ago (28 days left)
      {
        project_number: "OPS-R001",
        org_id: stockland.id,
        submitted_by: client1Id,
        status: "draft",
        po_number: null,
        extracted_fields: { CLIENT_ADDRESS: "8 Bottlebrush Court, Halcyon Vista" },
        deleted_at: daysAgo(2),
        created_at: daysAgo(5),
      },
      // Stockland — client2: submitted deleted 20 days ago (10 days left)
      {
        project_number: "OPS-R002",
        org_id: stockland.id,
        submitted_by: client2Id,
        status: "submitted",
        po_number: "PO-2024-042",
        extracted_fields: { CLIENT_ADDRESS: "22 Ironbark Avenue, Halcyon Promenade" },
        deleted_at: daysAgo(20),
        created_at: daysAgo(23),
      },
      // Stockland — client1: assigned deleted 8 days ago (22 days left)
      {
        project_number: "OPS-R003",
        org_id: stockland.id,
        submitted_by: client1Id,
        status: "assigned",
        po_number: "PO-2024-055",
        extracted_fields: { CLIENT_ADDRESS: "14 Silky Oak Street, Halcyon Serrata" },
        deleted_at: daysAgo(8),
        created_at: daysAgo(12),
      },
      // Meridian Group — client4: draft deleted 27 days ago (3 days left — near expiry)
      {
        project_number: "OPS-R004",
        org_id: meridian.id,
        submitted_by: client4Id,
        status: "draft",
        po_number: null,
        extracted_fields: { CLIENT_ADDRESS: "5 Meridian Boulevard, South Yarra VIC" },
        deleted_at: daysAgo(27),
        created_at: daysAgo(30),
      },
      // Meridian Group — client5: in_review deleted 5 days ago (25 days left)
      {
        project_number: "OPS-R005",
        org_id: meridian.id,
        submitted_by: client5Id,
        status: "in_review",
        po_number: "PO-2025-011",
        extracted_fields: { CLIENT_ADDRESS: "91 Collins Street, Melbourne VIC" },
        deleted_at: daysAgo(5),
        created_at: daysAgo(9),
      },
    ].filter((p) => p.submitted_by); // guard against missing user IDs

    const { error: recoveryErr } = await supabase.from("projects").insert(recoveryProjects);
    if (recoveryErr) {
      console.error("Failed to seed recovery bin:", recoveryErr.message);
    } else {
      console.log(`Seeded ${recoveryProjects.length} recovery bin entries across Stockland and Meridian Group`);
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log("\nSeed complete. Password for all accounts: Ops@TestPass1!");
  console.log("Note: 2FA setup required on first login.\n");
  console.log("Super Admin:");
  console.log("  admin@ops.test");
  console.log("\nConsultants:");
  console.log("  consultant@ops.test   — available");
  console.log("  consultant2@ops.test  — available   (Sarah Chen)");
  console.log("  consultant3@ops.test  — on_leave    (Marcus Webb)");
  console.log("  consultant4@ops.test  — at_capacity (Priya Nair)");
  console.log("  consultant5@ops.test  — available   (James O'Brien)");
  console.log("\nClients (Stockland):");
  console.log("  client@ops.test");
  console.log("  client2@ops.test  (Emma Davis)");
  console.log("  client3@ops.test  (Ryan Thompson)");
  console.log("\nClients (Meridian Group):");
  console.log("  client4@ops.test  (Alex Kim)");
  console.log("  client5@ops.test  (Sophie Laurent)");
  console.log("\nDummy project: OPS-0001 (submitted, unassigned) → /admin/projects");
  console.log("\nRecovery bin entries (soft-deleted):");
  console.log("  OPS-R001 — Stockland/client1,  draft,     deleted 2d ago  (28d left)");
  console.log("  OPS-R002 — Stockland/client2,  submitted, deleted 20d ago (10d left)");
  console.log("  OPS-R003 — Stockland/client1,  assigned,  deleted 8d ago  (22d left)");
  console.log("  OPS-R004 — Meridian/client4,   draft,     deleted 27d ago  (3d left — near expiry)");
  console.log("  OPS-R005 — Meridian/client5,   in_review, deleted 5d ago  (25d left)");
}

seed().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
