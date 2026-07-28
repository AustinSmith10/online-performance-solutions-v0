// Resets the UAT email-queue test scenarios back to their original pending
// state, re-uploading attachments as needed. Safe to re-run before every UAT
// round — every row uses a fixed id and is upserted, so this always leaves
// the same 10 scenarios in the same clean state regardless of what testers
// did to them last round (approved, rejected, reassigned, etc).
//
// Scope / limits: this only resets the queue rows themselves and the two
// synthetic projects/review created for the edge-case scenarios. If a tester
// resolved a "new submission" onto a REAL Stockland project (via Reassign),
// whatever that attached to the real project is NOT undone here — reverting
// arbitrary side effects on real projects is out of scope for this script.
//
// Requires SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL in .env.local.
// The 5 "real submission" attachments are read from local disk — set
// UAT_FIXTURES_DIR if they're not at the default path below.

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

const envText = fs.readFileSync(path.join(repoRoot, ".env.local"), "utf8");
const env = {};
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const STOCKLAND_ID = "d94fa2a3-ef12-40c1-aad9-4a943ee0db9f";
const TEMPLATE_ID = "e8a0e135-d370-4f7f-abf5-6d3327729a83";
const JAMAL_ID = "6b34aca7-d230-4ced-962d-2520bf533271"; // macjamal67@gmail.com, stakeholder
const CONSULTANT_ID = "5d7227f6-8d95-4461-b6aa-7a452abcea99"; // jonash.g@ddeg.com.au

// ─── Fixed ids — same scenarios every time this script runs ──────────────────

const DRAFT_PROJECT_ID = "d9826504-494d-4684-baa3-4b80cdcf7902";
const DISPATCHED_PROJECT_ID = "08acc1b8-3373-410a-b42c-e472a8069616";
const REVIEW_ID = "9a92f8be-11d3-4a23-aee2-b062f53c01d1";
const REVIEW_TOKEN = "b7f0b1c2a3d4e5f60718293a4b5c6d7e"; // fixed, not secret — UAT only

const THREAD_REPLY_QUEUE_ID = "4449b8f5-8896-4a30-9d55-2fd7741659dd";
const CLARIFICATION_QUEUE_ID = "fe0369ff-c639-4c70-a725-cca2074c23de";
const MULTI_ATTACHMENT_QUEUE_ID = "88c9a139-fbe3-49ce-9eb6-74ffde25c715";
const DUPE1_QUEUE_ID = "445ec230-7b7d-49cf-8625-a7a5d69eae07";
const DUPE2_QUEUE_ID = "16e12e6b-1fef-4de5-b2f0-61f19c04d768";

const REAL_SUBMISSIONS = [
  { folder: "Test8", queueId: "e0caa08b-8b75-4280-8eff-d932bad09055", site: "2120-237" },
  { folder: "Test9", queueId: "8a1dc14d-67bb-46fe-8697-73089b1b8515", site: "2117-338" },
  { folder: "Test10", queueId: "a0981c22-1b1f-44f1-8bc4-aed7372e866b", site: "2113-163" },
  { folder: "Test11", queueId: "ed93be4e-acb1-475c-8d0a-8d7fa2ad8671", site: "2116-037" },
  { folder: "Test12", queueId: "82640930-9116-4897-8462-51bd9a731bd7", site: "2120-117" },
];

const FIXTURES_DIR = env.UAT_FIXTURES_DIR || "/Users/ddeg/Desktop/ops demo/Test";

const MINI_PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\nxref\n0 4\n0000000000 65535 f \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n0\n%%EOF",
  "utf8"
);

async function uploadPlaceholder(queueId, filename) {
  const objectPath = `${queueId}/${filename}`;
  const { error } = await supabase.storage
    .from("pending-inbound")
    .upload(objectPath, MINI_PDF, { contentType: "application/pdf", upsert: true });
  if (error) throw new Error(`Upload failed for ${objectPath}: ${error.message}`);
  return { path: objectPath, filename, content_type: "application/pdf" };
}

async function uploadRealFile(queueId, filePath, filename) {
  const bytes = fs.readFileSync(filePath);
  const objectPath = `${queueId}/${filename}`;
  const { error } = await supabase.storage
    .from("pending-inbound")
    .upload(objectPath, bytes, { contentType: "application/pdf", upsert: true });
  if (error) throw new Error(`Upload failed for ${objectPath}: ${error.message}`);
  return { path: objectPath, filename, content_type: "application/pdf" };
}

function realSubmissionBody(site) {
  return `Hello\n\nCan you please complete your Performance solution Report for ${site}\n\nPlease find attached Purchase Order and Construction Issue Drawings.\n\nThe certifier on this site is :GMA Certification Pty Ltd\n\nIf you require any further information, please let me know.`;
}

async function resetQueueRow(row) {
  const { error } = await supabase.from("inbound_email_queue").upsert(
    {
      ...row,
      status: "pending",
      resolved_category: null,
      resolved_project_id: null,
      resolved_stakeholder_review_id: null,
      resolved_by: null,
      resolved_at: null,
      rejection_reason: null,
      clarification_token: null,
      clarification_expires_at: null,
      clarification_requested_at: null,
      clarification_requested_by: null,
      clarification_candidates: null,
      clarification_reply_text: null,
      clarification_message: null,
    },
    { onConflict: "id" }
  );
  if (error) throw new Error(`Queue upsert failed for ${row.id}: ${error.message}`);
}

async function main() {
  console.log("=== Resetting synthetic projects ===");
  const { error: draftErr } = await supabase.from("projects").upsert(
    {
      id: DRAFT_PROJECT_ID,
      client_id: STOCKLAND_ID,
      template_id: TEMPLATE_ID,
      submitted_by: JAMAL_ID,
      status: "draft",
      site_address: "Site 9999-000, Test Street, Burpengary East QLD",
      source: "portal",
    },
    { onConflict: "id" }
  );
  if (draftErr) throw new Error(`Draft project reset failed: ${draftErr.message}`);
  console.log("Draft project reset:", DRAFT_PROJECT_ID);

  const { error: dispErr } = await supabase.from("projects").upsert(
    {
      id: DISPATCHED_PROJECT_ID,
      client_id: STOCKLAND_ID,
      template_id: TEMPLATE_ID,
      submitted_by: JAMAL_ID,
      assigned_consultant_id: CONSULTANT_ID,
      status: "dispatched",
      project_number: "UAT-SEED-9999-003",
      po_number: "UAT-SEED-9999-003/200-075",
      site_address: "Site 9999-003, Test Street, Burpengary East QLD",
      source: "portal",
      review_cycle: 1,
    },
    { onConflict: "id" }
  );
  if (dispErr) throw new Error(`Dispatched project reset failed: ${dispErr.message}`);
  console.log("Dispatched project reset:", DISPATCHED_PROJECT_ID);

  const { error: reviewErr } = await supabase.from("stakeholder_reviews").upsert(
    {
      id: REVIEW_ID,
      project_id: DISPATCHED_PROJECT_ID,
      review_cycle: 1,
      stakeholder_email: "rattan.s@ops.test",
      stakeholder_name: "Rattan Sandhu",
      token: REVIEW_TOKEN,
      dispatched_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      status: "pending",
      comments: null,
      responded_at: null,
      waived_by: null,
      waive_reason: null,
      waived_at: null,
      email_reply_text: null,
      email_reply_received_at: null,
      email_reply_sender_verified: null,
    },
    { onConflict: "id" }
  );
  if (reviewErr) throw new Error(`Review reset failed: ${reviewErr.message}`);
  console.log("Stakeholder review reset:", REVIEW_ID);

  console.log("\n=== Resetting edge-case queue scenarios ===");

  const threadAttachment = await uploadPlaceholder(THREAD_REPLY_QUEUE_ID, "additional-doc.pdf");
  await resetQueueRow({
    id: THREAD_REPLY_QUEUE_ID,
    from_email: "macjamal67@gmail.com",
    from_name: "Jamal Mac",
    subject: "Re: Performance Solution Report Request - Site 9999-000",
    text_body: "Here's an additional drawing for this one, forgot to attach it the first time.",
    attachment_paths: [threadAttachment],
    proposed_category: "thread_reply",
    proposed_project_id: DRAFT_PROJECT_ID,
    match_reason: "mailbox_hash_projectid_match",
  });
  console.log("Thread reply queue item reset:", THREAD_REPLY_QUEUE_ID);

  await resetQueueRow({
    id: CLARIFICATION_QUEUE_ID,
    from_email: "certifier@stockland.test",
    from_name: "Jane Certifier",
    subject: "Re: your report",
    text_body:
      "Approved, all good from our end. (Replied without using the review link, so there's no token to match against.)",
    attachment_paths: [],
    proposed_category: "stakeholder_response",
    proposed_project_id: null,
    proposed_stakeholder_review_id: null,
    match_reason: "stakeholder_table_fallback",
  });
  console.log("Clarification-needed queue item reset:", CLARIFICATION_QUEUE_ID);

  const multi1 = await uploadPlaceholder(MULTI_ATTACHMENT_QUEUE_ID, "CIP.pdf");
  const multi2 = await uploadPlaceholder(MULTI_ATTACHMENT_QUEUE_ID, "PO.pdf");
  await resetQueueRow({
    id: MULTI_ATTACHMENT_QUEUE_ID,
    from_email: "macjamal67@gmail.com",
    from_name: "Jamal Mac",
    subject: "Performance Solution Report Request - Site 9999-002",
    text_body: realSubmissionBody("9999-002"),
    attachment_paths: [multi1, multi2],
    proposed_category: "new_submission",
    proposed_project_id: null,
    match_reason: "no_match",
  });
  console.log("Multi-attachment new-submission queue item reset:", MULTI_ATTACHMENT_QUEUE_ID);

  await resetQueueRow({
    id: DUPE1_QUEUE_ID,
    from_email: "rattan.s@ops.test",
    from_name: "Rattan Sandhu",
    subject: "Re: Performance Solution Report Request - Site 9999-003",
    text_body: "Approved, looks good.",
    attachment_paths: [],
    proposed_category: "stakeholder_response",
    proposed_project_id: DISPATCHED_PROJECT_ID,
    proposed_stakeholder_review_id: REVIEW_ID,
    match_reason: "token_match",
  });
  await resetQueueRow({
    id: DUPE2_QUEUE_ID,
    from_email: "rattan.s@ops.test",
    from_name: "Rattan Sandhu",
    subject: "Re: Performance Solution Report Request - Site 9999-003",
    text_body: "Actually one more note — please double check the roof pitch on drawing WD.103.",
    attachment_paths: [],
    proposed_category: "stakeholder_response",
    proposed_project_id: DISPATCHED_PROJECT_ID,
    proposed_stakeholder_review_id: REVIEW_ID,
    match_reason: "token_match",
  });
  console.log("Duplicate stakeholder-response queue items reset:", DUPE1_QUEUE_ID, DUPE2_QUEUE_ID);

  console.log("\n=== Resetting real submission scenarios ===");
  for (const sub of REAL_SUBMISSIONS) {
    const dir = path.join(FIXTURES_DIR, sub.folder);
    if (!fs.existsSync(dir)) {
      console.warn(`  Skipping ${sub.folder} (Site ${sub.site}): ${dir} not found — set UAT_FIXTURES_DIR if it moved`);
      continue;
    }
    const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".pdf"));
    if (files.length !== 2) {
      console.warn(`  Skipping ${sub.folder}: expected 2 PDFs, found ${files.length}`);
      continue;
    }
    const attachments = [];
    for (const filename of files) {
      attachments.push(await uploadRealFile(sub.queueId, path.join(dir, filename), filename));
    }
    await resetQueueRow({
      id: sub.queueId,
      from_email: "macjamal67@gmail.com",
      from_name: "Jamal Mac",
      subject: `Performance Solution Report Request - Site ${sub.site}`,
      text_body: realSubmissionBody(sub.site),
      attachment_paths: attachments,
      proposed_category: "new_submission",
      proposed_project_id: null,
      match_reason: "no_match",
    });
    console.log(`  Reset: Site ${sub.site} (${sub.queueId})`);
  }

  console.log("\nReset complete — all 10 scenarios are back to their original pending state.");
}

main().catch((err) => {
  console.error("RESET FAILED:", err.message);
  process.exit(1);
});
