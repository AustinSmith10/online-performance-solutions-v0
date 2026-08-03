# 02 — Consultant: Workflow

**Role:** Consultant — Test Consultant (`consultant@ops.test`)

One role-block covering both new projects: the direct submission from file 01, and the email-queue submission (2116-228 — Site 228/85 Twists Road, Burpengary East QLD, Halcyon Serrata).

## Part A — Pick up the direct-submission project

1. **Workspace** (`/ops`) → **Available jobs** tab → find the project from file 01 → **Pick up →**.
2. Set the **Project number** (field placeholder "e.g. 25-001") → **Save**.
3. Review the extracted fields on the project's **Details** tab. Use **Re-extract from documents** if something looks wrong.
4. Generate the PBDB and dispatch it to stakeholders.

## Part B — Resolve the email-queue submission

1. Before this step, the 2116-228 email must actually be sent to the inbound mailbox (Postmark) with the floor plan + PO attached — this is a real email send, not an in-app action.
2. **Email Queue** (`/ops/email-queue`) → **Pending** tab → find the "Performance Solution Report Request — Site 228" entry → review the attachments and subject → resolve it as a new submission, which creates the 16th project.

## Expect

- Direct-submission project moves to **Awaiting Approval** (admin/consultant pill) / **Awaiting stakeholder review** ("Right Now" heading) / **Awaiting review** (stakeholder portal pill).
- Email-queue project appears as a new row under **Projects**, unassigned, status **Submitted** or further along depending on how much of Part A's sequence the resolution action carries out automatically.

## Not yet confirmed live

- The exact button wording for "generate PBDB" and "dispatch to stakeholders" — I saw the *before* (Details tab, no PBDB yet) and *after* (Right Now: "Awaiting stakeholder review") states on an already-seeded project, but didn't click through this sequence myself to avoid mutating your 15 seeded projects. Walk through it live and treat any mismatch as a real finding.
- The exact resolution action/button label on a **Pending** email-queue row (I confirmed the queue's tab structure — Pending / Awaiting reply / Approved / Rejected — but the queue was empty at the time I checked, so the resolve-into-project button text is unverified).
