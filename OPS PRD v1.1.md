# OPS — Online Performance Solutions
## Product Requirements Document
**Version:** 1.1
**Date:** 2026-06-04
**Status:** Ready for Development

---

## Changelog

| Version | Date | Changes |
|---|---|---|
| 1.0 | 2026-06-04 | Initial release |
| 1.1 | 2026-06-04 | Stakeholder model redesigned (tokenised links, no OPS accounts); PBDB generation timing moved to consultant project-number entry; SLA renamed to Expected Delivery Timeline, escalation system removed; consultant assignment manual in Phase 1; duplicate detection keyed on PO number; schema updated; Gotenberg image corrected; US-34 and US-36 moved to Phase 2 |

---

## Problem Statement

DDEG Pty Ltd currently produces Performance Based Design Briefs (PBDBs) and Performance Based Design Reports (PBDRs) for volume builder clients (e.g. Stockland/Halcyon Constructions) through an entirely manual, consultant-driven process. Every report request triggers a cascade of human touchpoints: Admin manually creates a project record in Microsoft Access, moves files, chases missing information, and forwards work to a Senior Consultant for assignment. The Senior Consultant checks workload availability and assigns a consultant, who then waits before starting. The consultant opens the Word template, manually populates it, runs macros, verifies macro output, sends for QA, addresses QA feedback, sends the PBDB to stakeholders via a standalone Google Form for review, waits for approval, converts the document to a PBDR, and manually emails it to the client.

For Stockland, every one of these reports contains the same two Performance Solutions (PS1: Alternate Window Head Flashing, PS2: Alternate Grading to External Areas) with only project-specific metadata changing between sites. The full cycle takes approximately 3.5 hours of consultant and admin time per report, on a fixed fee of $500 per site. At volume, this is a losing proposition: low-margin, high-friction, high-error-risk work that displaces higher-margin consultancy engagements.

The core issues are:
- Admin manually re-types identical metadata into Access for every Stockland job
- Consultants wait for assignment before starting, adding avoidable delays
- The report template is manually populated even though the content is almost entirely static
- QA exists primarily to catch cosmetic errors the system should have prevented
- The Google Form approval process is disconnected from project management
- The PBDB-to-PBDR macro conversion is manual and error-prone
- No client-facing portal — all interaction happens over email

---

## Solution

OPS (Online Performance Solutions) is a web application that automates the Performance Solution Report workflow for volume builder clients. Clients log in, fill in a project details form, upload their building plans and Purchase Order, and submit. The system extracts key data from uploaded documents using the Claude API and pre-fills the form for client confirmation. Once a consultant enters the DDEG internal project number, the system generates the PBDB by performing find-and-replace on a pre-configured Word template, routes it through consultant QA, dispatches it to stakeholders for approval via tokenised email links, manages the approval cycle, and — once all approvals and payment conditions are met — converts the PBDB to a final PBDR PDF and delivers it to the client automatically.

OPS is deliberately fast, cheap, and stripped back. It is a separate product from DDEG's premium consultancy offering. It targets volume builders constructing 500+ standardised homes annually, who need templated Performance Solution Reports quickly and at low cost. DDEG retains its premium consultancy brand for complex, non-repeatable work. OPS captures an untapped volume market without cannibalising that positioning.

**Phase 1 target:** Stockland as pilot client. Eliminate consultant time burden on templated reports. Admin still maintains Access records alongside OPS in Phase 1.

**Phase 2 target:** Zero Admin touch per OPS job. Xero payment integration. In-system template placeholder mapper. Consultant auto-assignment with round-robin rotation. Self-service credit purchase.

---

## User Stories

### Client — Onboarding

1. As a Client, I want to receive a login invitation from DDEG after my organisation is set up, so that I can access OPS without needing to self-register.
2. As a Client, I want to complete my profile (first name, last name, phone number, company role/job title, state/territory) when I accept my invitation, so that DDEG has accurate contact details for my account.
3. As a Client, I want multiple team members at my organisation to have individual logins under the same org account, so that the right people at my company can submit and track reports.
4. As a Client, I want to be required to set up two-factor authentication before I can access the portal, so that my account and my submitted documents are secure.
5. As a Client, I want to be automatically logged in if my session cookie is still valid when I click a deep link, so that I don't have to re-enter credentials unnecessarily.

### Client — Submission via Portal

6. As a Client, I want to log in to the OPS portal and submit a new report request by filling in a project details form, so that I can initiate a Performance Solution Report without sending an email.
7. As a Client, I want the system to extract key project data from my uploaded Purchase Order and building plans and pre-fill the form fields, so that I spend minimal time on data entry.
8. As a Client, I want to review and correct any pre-filled fields before submitting, so that I can catch any extraction errors before the report is generated.
9. As a Client, I want to upload my building plans and Purchase Order as part of the submission, so that the consultant has everything they need without me sending separate emails.
10. As a Client, I want to receive an email and dashboard confirmation immediately after I submit, so that I know my request has been received and is being processed.

### Client — Submission via Email Webhook

11. As a Client, I want to email the OPS intake address with my project information and attachments, so that I can initiate a report request the same way I do today.
12. As a Client, I want the system to recognise my email address and automatically create a draft submission from my email, so that I don't have to re-enter information I already provided.
13. As a Client, I want to receive an acknowledgement email with a portal link when my email is processed, so that I can log in and complete or confirm my draft submission.
14. As a Client, I want to be able to reply to OPS system emails to add attachments to my existing draft, so that I can supplement my submission without starting over.
15. As a Client, I want to receive a clear reply if my email address is not recognised, including instructions on how to register, so that I know what to do next.

### Client — Project Tracking

16. As a Client, I want to see all my submitted projects in a dashboard with their current status, so that I can track progress without emailing DDEG.
17. As a Client, I want to see the expected delivery date for each project clearly displayed as "Your report is due by [date]", so that I know when to expect my report.
18. As a Client, I want to receive email and dashboard notifications when my report status changes, so that I am kept informed at key milestones.
19. As a Client, I want to see my credit balance on my dashboard, so that I know how many reports I can still request.

### Client — PBDB Review and Approval

20. As a Client, I want to receive an email with the PBDB attached and a tokenised deep link to the OPS approval form when my report is ready for review, so that I can review it and provide my response.
21. As a Client, I want to be taken directly to the approval form when I click the deep link, with automatic login if my session is active, so that the approval process has minimum friction.
22. As a Client, I want to select "Acknowledge" or "Request Modifications" on the approval form, so that I can formally confirm whether the PBDB is correct.
23. As a Client, I want to add comments when I select "Request Modifications", so that the consultant knows specifically what needs to change.
24. As a Client, I want my approval response to be timestamped and attributed to my email address, so that there is a clear record of when I reviewed and what I decided.
25. As a Client, I want to see which approvals are still pending on my project dashboard, so that I can follow up with any stakeholders who haven't responded.
26. As a Client, I want to receive a notification when all approvals are complete and my PBDR is being prepared, so that I know the final report is imminent.

### Client — PBDR Receipt and History

27. As a Client, I want to receive an email with my final PBDR attached once it has been generated, so that I get the report directly in my inbox.
28. As a Client, I want to download my PBDR from the OPS portal at any time after delivery, so that I have a permanent accessible copy.
29. As a Client, I want my delivered PBDRs to be permanently stored in my Report History, so that I can retrieve any past report indefinitely.
30. As a Client, I want my past reports to be immutable and locked after delivery, so that I have confidence the issued version will never be altered.

### Client — Account Management

31. As a Client, I want to recover deleted drafts within 30 days of deletion, so that I can undo accidental deletions.
32. As a Client, I want to be the only person who can delete my own drafts and projects, so that consultants cannot inadvertently remove my work.
33. As a Client, I want to receive a notification when my credit balance is low, so that I can arrange a top-up before I need my next report.

### Consultant — Assignment and Availability

34. As a Consultant, I want to set my availability status in OPS (Available / On Leave / At Capacity), so that Super Admin can see who is free when manually assigning projects.
35. As a Consultant, I want to receive an email and dashboard notification when I am assigned to a project, so that I can begin QA promptly.

### Consultant — QA Workflow

36. As a Consultant, I want to see all projects assigned to me on my dashboard, so that I have a clear view of my current workload.
37. As a Consultant, I want to enter the DDEG internal project number before I can download the PBDB, so that the project is registered in our ERP system before QA begins.
38. As a Consultant, I want the system to generate the PBDB once I enter the project number, so that the document is populated with all confirmed field values including the project number.
39. As a Consultant, I want to download the generated PBDB from OPS, so that I can open it in Word for review and completion.
40. As a Consultant, I want to review the generated PBDB in Word, add the required plan images by manually snipping and pasting from the uploaded building plans, correct any errors, and re-upload the completed document, so that the PBDB is accurate and complete before it goes to stakeholders.
41. As a Consultant, I want to mark QA as complete after re-uploading the corrected PBDB, so that the system proceeds to stakeholder dispatch.
42. As a Consultant, I want to receive a notification when a stakeholder requests modifications to the PBDB, so that I can action the changes promptly.
43. As a Consultant, I want to download the current PBDB, make the requested corrections in Word, re-upload it, and mark revision complete, so that the updated PBDB is dispatched to all stakeholders for re-approval.
44. As a Consultant, I want to see all stakeholder comments attached to a modification request before I download the document, so that I know exactly what changes are needed.

### Super Admin — Organisation and User Management

45. As a Super Admin, I want to create client organisation accounts and configure their templates, credit balance, payment method, expected delivery timeline, and stakeholder list, so that each client's OPS account is correctly set up before they start submitting.
46. As a Super Admin, I want to send login invitations to individual client users and assign them to their organisation account, so that the right people have access.
47. As a Super Admin, I want to manage multiple users under a single client org, each with their own credentials, so that volume builder teams with multiple contacts can all access OPS.
48. As a Super Admin, I want to manage consultant accounts and their availability, so that I have visibility on who is free to be assigned when a new project comes in.
49. As a Super Admin, I want to unlock locked user accounts, so that I can resolve access issues without requiring a password reset cycle.
50. As a Super Admin, I want to configure an email whitelist per organisation, so that only authorised sender domains can submit via the email webhook for that org.
51. As a Super Admin, I want to manually assign a consultant to a project when a new submission arrives, so that the project is allocated promptly.
52. As a Super Admin, I want to be notified by email and dashboard when a new project is submitted, so that I can assign a consultant without delay.

### Super Admin — Stakeholder Management

53. As a Super Admin, I want to configure a default stakeholder list per client organisation (name, email, company, and any additional metadata), so that the correct parties are always notified for approval without per-project setup.
54. As a Super Admin, I want to override the stakeholder list at the template or project level, so that I can accommodate one-off certifier changes or project-specific requirements without affecting the org default.
55. As a Super Admin, I want to add, remove, or update stakeholders at any time, so that personnel changes at certifying organisations do not block the approval workflow.
56. As a Super Admin, I want to re-send a fresh approval link to a stakeholder whose link has expired, so that the approval workflow is not permanently blocked by an unresponsive party.
57. As a Super Admin, I want to waive a stakeholder's approval response when they are unreachable, with a mandatory written reason, so that urgent jobs can proceed with full accountability documented in the audit trail.

### Super Admin — Template Management

58. As a Super Admin, I want to upload a .docx template file and assign it to a specific client organisation, so that OPS uses the correct template for that client's reports.
59. As a Super Admin, I want to assign multiple templates to a single client account, so that clients with multiple product types or Performance Solution sets each have the right template available.
60. As a Super Admin, I want OPS to parse the uploaded template and display all placeholder tokens found in the document, so that I can verify the template is correctly structured before activating it.
61. As a Super Admin, I want to see a mapping table showing each placeholder token and its configured data field binding, so that I can confirm the find-and-replace logic is correct.
62. As a Super Admin, I want unmapped placeholders flagged in red and missing placeholders flagged in yellow in the template validation UI, so that I can identify and fix configuration gaps before the template goes live.
63. As a Super Admin, I want the system to block template activation until all red flags are resolved, so that a misconfigured template can never be used to generate a report.
64. As a Super Admin, I want to deactivate or replace a template without deleting historical reports generated from it, so that I can update templates while preserving audit integrity.

### Super Admin — Payment and Credits

65. As a Super Admin, I want to toggle each client account between three payment methods (Upfront, Deferred/End-of-period, Credit Deduction), so that each client's billing arrangement is correctly reflected in OPS.
66. As a Super Admin, I want to manually update a client's token balance, so that I can top up credits after payment is received without a Xero integration.
67. As a Super Admin, I want to configure a credit limit for clients on the Deferred billing method, so that outstanding balances are capped at an agreed level.
68. As a Super Admin, I want to see each client's current credit balance and outstanding deferred balance on their account page, so that I can identify clients who owe payment.
69. As a Super Admin, I want to freeze a deferred account that has exceeded its credit limit, so that no further reports can be submitted until the balance is settled.
70. As a Super Admin, I want to manually override the payment gate for PBDR conversion when a client has an urgent need and has verbally committed to payment, so that the system does not become an immovable block in exceptional circumstances.
71. As a Super Admin, I want to be required to enter a written reason before executing a payment gate override, so that every override is documented and accountable.
72. As a Super Admin, I want overridden projects to be flagged with "Override — Payment Pending" status and surfaced in my dashboard until payment is reconciled, so that no outstanding payment is forgotten.
73. As a Super Admin, I want to receive a dashboard and email notification when a credit balance anomaly or error is detected, so that I can investigate and resolve it promptly.

### Super Admin — Delivery Timeline

74. As a Super Admin, I want to configure the expected delivery timeline (in working days) per client organisation, so that each client's agreed turnaround time is reflected in the portal.
75. As a Super Admin, I want to see a passive overdue indicator on my dashboard for any project that has passed its expected delivery date, so that I can intervene without automated escalation noise.

### Super Admin — Audit Trail and Reporting

76. As a Super Admin, I want to access a full event audit log for every project, so that I can investigate disputes and demonstrate compliance with ISO traceability requirements.
77. As a Super Admin, I want the audit log to record every significant system action — logins, form submissions, status changes, approvals, rejections, payment updates, document generation, email sends, consultant assignments, stakeholder waiver decisions, and overrides — with a timestamp and attributed user, so that the log is a complete and reliable source of truth.
78. As a Super Admin, I want to search and filter the audit log by project, user, date range, and event type, so that I can quickly locate the records I need.
79. As a Super Admin, I want the audit log to include approval form timestamps and respondent email addresses, so that I have legally defensible evidence if a client disputes having approved a PBDB.
80. As a Super Admin, I want all project documents and audit records to be retained for the lifetime of the project (minimum 7 years), so that DDEG meets its professional indemnity insurance obligations.

### Super Admin — System Operations

81. As a Super Admin, I want to receive a dashboard notification when an OPS system error occurs, so that I can investigate and resolve it without waiting for a user to report it.
82. As a Super Admin, I want to access the Recovery Bin for all organisations, so that I can recover any deleted item within the 30-day window regardless of which user deleted it.

---

## Implementation Decisions

### Roles and Permissions

Three roles exist in OPS. Stakeholders (certifiers and other approval parties) are external to OPS — they do not have accounts and interact solely via tokenised email links. All data access is scoped to the user's organisation unless the role explicitly grants broader access.

| Permission | Client | Consultant | Super Admin |
|---|---|---|---|
| Submit new reports | ✓ | — | ✓ |
| View own submissions | ✓ | — | ✓ |
| View all org submissions | ✓ (own org) | — | ✓ (all) |
| Upload attachments | ✓ | — | ✓ |
| Access project details form | ✓ | — | ✓ |
| View generated PBDB | ✓ (watermarked) | ✓ | ✓ |
| Perform manual QA | — | ✓ | ✓ |
| Approve / reject PBDB | ✓ | ✓ | ✓ |
| Delete own drafts/projects | ✓ | — | ✓ |
| Manage users | — | — | ✓ |
| Manage organisations | — | — | ✓ |
| Manage stakeholder lists | — | — | ✓ |
| Assign templates to org | — | — | ✓ |
| Configure org defaults | — | — | ✓ |
| View audit trail | — | — | ✓ |
| Manage credit packages | — | — | ✓ |
| Unlock locked accounts | — | — | ✓ |
| Configure email whitelist | — | — | ✓ |
| Set own availability | — | ✓ (own) | ✓ |
| Manually assign consultant | — | — | ✓ |
| Re-send / waive stakeholder approval | — | — | ✓ |
| Access Recovery Bin | ✓ (own) | — | ✓ (all) |
| Access Report History | ✓ (own org) | — | ✓ (all) |
| Override payment gate | — | — | ✓ |

### Tech Stack

- **Framework:** Next.js (TypeScript) — full-stack, single codebase
- **Hosting:** Railway — persistent Node.js server, no serverless cold-start limitations, supports background workers and Docker services
- **Database:** Supabase (PostgreSQL) — project records, users, orgs, audit log, job queue
- **Authentication:** Supabase Auth — 2FA mandatory for Client, Consultant, and Super Admin users; session management; password policy enforcement
- **File Storage:** Supabase Storage — Word templates, uploaded POs, building plans, generated PBDBs, PBDR PDFs
- **Word generation:** `docxtemplater` — find-and-replace on .docx templates, image bookmark insertion
- **Watermark removal:** PizZip (bundled with docxtemplater) — iterates all header XML files in the .docx and strips watermark shape elements during PBDR conversion
- **PDF conversion:** Gotenberg — Docker service deployed on Railway, converts .docx to PDF via LibreOffice headlessly, called via HTTP from OPS backend
- **AI extraction:** Claude API (`claude-haiku-4-5`) with Files API — extracts project field values from uploaded Purchase Orders and building plans; returns per-field confidence scores
- **Background job queue:** `pg-boss` — PostgreSQL-backed job queue on Supabase; handles async document generation, email dispatch, approval buffer timers, draft expiry, and Recovery Bin purges
- **Email sending:** Resend — transactional emails, React Email templates
- **Email inbound webhook:** Postmark Inbound — receives incoming client emails, parses them, fires HTTP webhook to OPS backend for processing; MailboxHash used for reply threading

### Security

- **2FA:** Mandatory for Client, Consultant, and Super Admin users — no exceptions. Enforced by Supabase Auth at login. Not applicable to stakeholders (no OPS account).
- **Session timeout:** 8 hours for Client users. 4 hours for Consultant and Super Admin users.
- **Password policy:** Minimum 12 characters, at least one uppercase letter, one number, one special character. Enforced at registration and on password change via Supabase Auth.
- **Deep link authentication (portal users):** When a Client clicks a deep link, the system checks for a valid session cookie and auto-logs them in if valid. If no valid session, the user is redirected to the login screen and returned to the deep link destination after authentication.
- **Stakeholder approval links:** Tokenised, single-use per cycle, time-limited to 5 working days. No OPS account or login required. Token validated server-side on form submission; response attributed to the email address the token was issued to.

### Client Submission Flow — Portal

1. Client logs in to OPS portal.
2. Client selects "New Report Request." If the org has one active template, it is auto-selected. If the org has multiple active templates, a "Report type" dropdown is shown and the client selects the applicable template.
3. Client uploads Purchase Order and building plans.
4. System sends uploaded files to the Claude API (`claude-haiku-4-5`) for field extraction. Extracted values are pre-filled in the form; low-confidence fields are flagged for client review.
5. Client reviews pre-filled fields, corrects any errors, and submits.
6. System validates the submission (all required fields populated, PO number present, at least one supported attachment).
7. Duplicate check: if a project with the same PO number exists within the same org and is not in `delivered` or `complete` status, the submission is flagged, Super Admin and client are notified, and no new record is created. Super Admin makes the final call.
8. On successful submission: project record created in `submitted` status, expected delivery date calculated, Super Admin notified to assign a consultant, client receives email + dashboard confirmation.

### Client Submission Flow — Email Webhook

1. Client emails the OPS Postmark inbound address.
2. Postmark fires HTTP webhook to OPS backend.
3. System validates sender against registered user accounts. If no match: "unrecognised sender" reply sent, processing stops.
4. System validates minimum content (attachment present, project reference detectable).
5. If sufficient: draft created, files attached, extracted data pre-filled via Claude API, portal login link sent to client.
6. If insufficient: client receives instructions to complete form manually in portal.
7. Client logs in, completes/confirms the draft, and submits.
8. Duplicate check: if a project with the same PO number already exists within the org and is not in `delivered` or `complete` status, the system flags it, notifies Super Admin and the sender, and does not create a second record.
9. Email threading: replies to OPS system emails are associated with the existing draft via Postmark MailboxHash; attachments are ingested into that draft.
10. Abandoned drafts: if a draft created via email webhook receives no activity (no login, no field update) for 14 days, it is automatically moved to the Recovery Bin. The 14-day threshold is configurable by Super Admin per org.

### Template System

**Eligibility requirements for a new template:**
- Client must be a volume builder
- Discipline Director approval required
- 500+ standardised builds annually using pre-designed plans
- Same Performance Solution set for every report

**Template creation process (external to OPS):**
- Senior Consultant builds the PBDB template following the standard Word workflow
- Template undergoes QA and Client + Stakeholder review and approval
- Super Admin interviews Senior Consultant to identify all required form fields and file/image upload requirements
- Super Admin manually adds placeholder tokens to the .docx (e.g. `{{SITE_ADDRESS}}`, `{{PROJECT_NO}}`, `{{COMMENCEMENT_DATE}}`)
- Super Admin uploads the .docx to OPS and assigns it to the client organisation
- Word watermark is applied to the template using Word's standard Format → Watermark tool — no special markup required; OPS handles removal programmatically at PBDR conversion

**Template validation UI (within OPS, at upload time):**
- System parses the uploaded .docx and extracts all placeholder tokens
- Displays a mapping table: each placeholder token ↔ configured data field
- Red flag: placeholder in doc with no field mapped
- Yellow flag: required field configured but no placeholder found in doc
- System blocks template activation until all red flags are resolved
- Super Admin confirms the mapping before activation

**Template model:**
- One client may have many templates
- One template belongs to exactly one client (no cross-client sharing)
- Each template is client-specific (customised PS set, branding, legislative references)

**Find-and-replace execution:**
- PBDB generation is triggered when the consultant enters the DDEG internal project number for a project
- `docxtemplater` performs find-and-replace on the template using all confirmed field values (client-submitted fields + project number)
- Image placeholders are Word bookmarks; image insertion during QA is performed manually by the consultant in Word (Phase 1)

### Consultant Assignment

- **Phase 1 — Manual assignment only.** Auto-assignment and round-robin rotation are Phase 2.
- On every new project submission, Super Admin is notified by email and dashboard to assign a consultant.
- Consultant availability states (Available / On Leave / At Capacity) are visible to Super Admin when selecting a consultant to assign.
- Super Admin assigns the consultant from the project record in the admin portal.
- Consultant is notified by email and dashboard on assignment.
- Super Admin can reassign at any time.

### Stakeholder Approval Flow

**Stakeholder model:**
- Stakeholders are external parties (certifiers, etc.) who do not have OPS accounts.
- Each org has a default stakeholder list (name, email, company, metadata JSON for additional details such as licence numbers).
- The stakeholder list can be overridden at the template level or the project level by Super Admin.
- Resolution order at dispatch: project stakeholders → template stakeholders → org stakeholders.
- Stakeholder placeholder values (e.g., `{{CERTIFIER_NAME}}`, `{{CERTIFIER_COMPANY}}`) resolve from the applicable stakeholder record at PBDB generation time.

**Dispatch:**
- On consultant QA completion, system dispatches PBDB to client and all applicable stakeholders.
- Each recipient receives: email with PBDB attached + unique tokenised approval link.
- Client recipients (who have OPS accounts) are also shown the approval tray in their portal dashboard.
- Stakeholders (no OPS account) interact solely via the tokenised link — no login required.

**Approval link behaviour:**
- Each token is unique per stakeholder per dispatch cycle.
- Token expires after 5 working days.
- On first stakeholder response, the 1-day buffer timer starts.
- If a token expires before use, the 1-day buffer follow-up re-sends a fresh token to that stakeholder.
- If the fresh token also expires with no response: project is surfaced on Super Admin dashboard as "Awaiting stakeholder response — action required." Super Admin can re-send a fresh link, update the stakeholder email address, or waive the response with a mandatory written reason (logged to audit trail).

**Approval form fields:**
- Response: Acknowledged / Request Modifications
- Comments (required if Request Modifications selected)
- Response is timestamped and attributed to the email address the token was issued to

**Approval states:** Pending / Acknowledged / Modifications Requested

**1-day buffer rule:**
- Timer starts when the first stakeholder response is logged (not when dispatch emails are sent)
- After 1 working day, system sends an update email to all stakeholders informing them of any outstanding responses or modification requests
- Non-responding stakeholders receive a direct follow-up with a fresh token

**Modifications Requested path:**
- Consultant receives: dashboard notification + email with all stakeholder comments attached
- Current PBDB available for download from OPS
- Consultant edits in Word, re-uploads revised PBDB
- All prior approvals are reset; system re-dispatches to all stakeholders from scratch with new tokens
- Stakeholders who had previously approved receive an update email informing them of the revision and requesting re-review

**Approval completion:**
- PBDR conversion requires: all stakeholders Acknowledged AND payment gate satisfied
- System version-stamps each review cycle, preserving prior PBDB versions and stakeholder responses

### Payment System

Three payment methods, toggled per client account by Super Admin:

**Method 1 — Upfront:**
- Client pays before work begins (single or bulk)
- Super Admin manually logs payment and updates token balance after invoice is paid
- At PBDB dispatch: ledger entry recorded, no balance check required
- Phase 2: Xero webhook auto-confirms payment and updates balance

**Method 2 — Deferred / End-of-Period:**
- Reports submitted against a running tab (negative balance permitted up to configured credit limit)
- At PBDB dispatch: deduction always proceeds unless account is frozen or the deferred credit limit would be exceeded
- Super Admin reconciles manually when payment received
- Super Admin can freeze a deferred account if credit limit is exceeded

**Method 3 — Credit Deduction:**
- Client pre-purchases credit tokens; each report deducts one token
- Credit deducted at **PBDB dispatch** (not at submission, not at conversion)
- At dispatch: system verifies balance ≥ 1 → deducts credit → logs deduction → updates balance → notifies client via email + dashboard
- If insufficient balance at dispatch: PBDB is not dispatched, client and Super Admin are notified
- Conversion pre-check verifies deduction already occurred

**PBDR release hard gates (all must be satisfied):**
1. Credit deduction confirmed and logged
2. Credit balance updated
3. All required stakeholder approvals stored

**Super Admin payment override:**
- Super Admin can manually bypass the payment gate in exceptional circumstances
- Override requires a mandatory written reason before execution
- Override is logged in the audit trail with: Super Admin identity, timestamp, reason, gates bypassed
- Project flagged "Override — Payment Pending" on dashboard until payment manually reconciled
- Super Admin receives dashboard reminder until balance is cleared

### PBDB → PBDR Conversion

**Pre-conversion verification (hard gates):**
- Credit deduction confirmed
- All stakeholder approvals stored
- If either condition not met: conversion blocked, Super Admin notified, manual resolution required

**Text transformations:**

| Location | From | To |
|---|---|---|
| Cover Title banner | "Building Solutions performance based Design Brief" | "Building Solutions performance based Design Report" |
| Cover Page Document Title | "Building Solutions – Performance Based Design Brief" | "Building Solutions – Performance Based Design Report" |
| Revision History — DOC column | "PBDB" | "PBDR" |
| Revision History — PURPOSE column | "Stakeholder Review" | "For Construction" |
| Executive Summary framing | "This Performance Based Design Brief identifies the variations…" | "This Performance Based Design Report identifies the variations…" |
| Section 1.1 Introduction Purpose | "This Performance Based Design Brief identifies the proposed performance provisions…" | "This Performance Based Design Report evaluates the proposed performance provisions…" |
| Section 3 sub-headings | "Preliminary Evaluation" | "Evaluation" |
| Section 3 sub-headings | "Preliminary Conclusion" | "Conclusion" |
| Watermark | Present (standard Word watermark in document header) | Removed via PizZip XML manipulation in `converter.ts` |

**Watermark removal implementation:**
`lib/documents/converter.ts` uses PizZip (bundled with docxtemplater — no additional dependency) to open the .docx, iterate all header XML files (`word/header1.xml`, `header2.xml`, etc.), strip watermark shape elements from the XML, and save the modified file before passing it to Gotenberg. No special template markup required.

**PDF generation:**
- Transformed .docx sent to Gotenberg (Railway Docker service)
- Gotenberg converts via LibreOffice headless → final PDF
- PDF is non-editable and non-modifiable after generation
- Conversion must complete within 60 seconds under normal conditions
- Conversion is atomic — full rollback on any transformation or PDF generation failure

> <span style="color:red">**⚠ FONT DEPENDENCY — ACTION REQUIRED BEFORE PRODUCTION DEPLOY**</span>
>
> The PBDB template uses **DINOT** (Bold, Medium, Light variants) for headings/branding — a commercial Linotype/Monotype font. LibreOffice (inside Gotenberg) will silently substitute a generic sans-serif if DINOT is not installed, causing the PDF headings to render in the wrong typeface.
>
> **When the DINOT font files are obtained (`.ttf` or `.otf`):**
> 1. Place the files in `docker/fonts/` (create the directory if it doesn't exist)
> 2. Add the following to the Gotenberg `Dockerfile` (or Railway's build config):
>    ```dockerfile
>    COPY fonts/DINOT*.ttf /usr/share/fonts/truetype/dinot/
>    RUN fc-cache -fv
>    ```
> 3. For local development with LibreOffice (`scripts/deliver-pbdr.ts`): copy the files into `~/Library/Fonts/` on macOS.
>
> Calibri (body text) and Aptos are already resolved — they were copied from the local Microsoft Word app bundle into `~/Library/Fonts/` during development (2026-06-19). These must also be added to the Gotenberg Docker image via the same `COPY`/`fc-cache` method.

**File naming convention:**
```
<<ProjectNo>>-S_PBDR_R<<n>>_<<address>>_<<YYYY_MM_DD>>
```

Address sanitisation rules:
- Spaces → underscores
- Commas, periods, apostrophes, quotation marks → removed
- Forward/backslashes → hyphens
- Non-alphanumeric characters (except underscore, hyphen) → removed
- Address component truncated to max 80 characters
- Full filename max 200 characters
- Entire filename converted to uppercase

Revision number (`n`) starts at 0 and increments on each re-issue.

**Storage:**
- PBDR PDF saved to project Delivery folder in Supabase Storage
- PBDR stored in client's Report History (Previous Reports)
- Both approved PBDB and generated PBDR retained alongside each other for audit

**Conversion event log:**
- Submission ID
- PBDB version
- PBDR version
- Conversion start and end timestamps
- Conversion outcome (success / failure / rollback)

### PBDR Delivery

- System auto-emails final PBDR to the **submitter** (`submitted_by`) and, if specified, the **additional delivery recipient** (`delivery_recipient_email`). Stakeholders do not receive the PBDR — they receive only the PBDB during the approval cycle.
- PBDR simultaneously available in client portal under Report History
- System logs delivery timestamp on successful send
- Project marked complete
- Report History entry: project name, address, date delivered, PBDR download link, assigned consultant

### Expected Delivery Timeline

- Duration is **org-specific**, configured by Super Admin per client account in working days. Default: 5 working days.
- **Working days:** Calculated using a public holiday API (no hardcoded calendars). Saturday and Sunday always excluded. Public holidays applied per org state/territory.
- **Clock starts:** at portal form submission (not at assignment, not at project number entry).
- **Clock behaviour:** Runs continuously. Not paused for client delays or pending actions — all elapsed time counts.
- **Client visibility:** "Your report is due by [date]" displayed on project dashboard.
- **Internal visibility:** Passive overdue indicator shown on Super Admin dashboard for any project past its expected delivery date. No automated escalation emails or notifications.

### Notification System

All notifications are sent to both email and dashboard channels. There is no per-user preference to suppress either channel.

| Event | Recipient | Channel |
|---|---|---|
| New job created via email webhook | Client | Email — acknowledgement + draft ready |
| New job submitted via portal | Client | Email + dashboard confirmation |
| New project submitted — assign consultant | Super Admin | Email + dashboard |
| Job assigned to consultant | Consultant | Email + dashboard |
| Stakeholder review email sent | Client + all stakeholders | Email with PBDB attached + tokenised approval link |
| Stakeholder acknowledges PBDB | Consultant + Super Admin | Dashboard |
| Stakeholder requests modifications | Consultant | Email + dashboard |
| 1-day buffer expires — non-response | All stakeholders (update) + direct follow-up to non-responding stakeholder | Email with fresh token |
| Stakeholder link expired — no response after follow-up | Super Admin | Dashboard — action required |
| Consultant marks QA complete | Super Admin | Dashboard |
| Payment confirmed / tokens updated | Client + Super Admin | Email + dashboard |
| PBDR unlocked and delivered | Client (+ delivery recipient if set) | Email + dashboard |
| Project marked complete | Super Admin | Dashboard |
| Low credit balance | Client + Super Admin | Email + dashboard |
| OPS system errors | Super Admin | Dashboard |
| Credit balance errors / anomalies | Super Admin | Dashboard |

### Audit Trail

- Every significant system action logged: logins, form submissions, status changes, approvals, rejections, payment updates, document generation, email sends, consultant assignments, stakeholder waiver decisions, payment overrides, system errors
- Each log entry contains: event type, actor (user ID + email, or stakeholder email for external actions), timestamp, affected project/record, metadata (e.g. override reason, gateway state, waiver reason)
- Super Admin searchable UI: filter by project, user, date range, event type
- All records retained for the lifetime of the project (minimum 7 years) aligned with DDEG professional indemnity insurance requirements
- Audit trail is immutable — no record can be edited or deleted

### Recovery Bin

- Soft delete: deleted drafts and projects moved to Recovery Bin, not permanently removed
- 30-day recovery window: items auto-purge after 30 days
- Abandoned email webhook drafts: auto-moved to Recovery Bin after 14 days of inactivity; threshold is configurable by Super Admin per org
- Delete action: Client-only. Consultants cannot delete client drafts or projects.
- Client sees: own org's deleted items only
- Super Admin sees: all organisations' Recovery Bin items

### Report History

- Permanent retention, never purged
- Each delivered PBDR is immutable after generation — no modifications permitted post-delivery
- Client can download their issued PBDR indefinitely
- Super Admin can access Report History for all organisations

### Microsoft Access (Phase 1)

OPS runs **alongside** Microsoft Access in Phase 1. Admin must still manually create a project record in Access for every OPS job. The Super Admin notification triggered on each new project submission serves as the cue to create the corresponding Access record. OPS does not integrate with or replace Access in Phase 1.

---

## Testing Decisions

### What makes a good test for OPS

Tests should verify **external observable behaviour** — what the system does in response to an action — not implementation details like internal function calls, database query shapes, or library internals. A good OPS test answers the question: "Given this input or event, does the system produce the correct output and state?"

### Modules to test

**Submission flow:**
- Email webhook: given a valid sender email + attachment, assert draft is created with correct pre-filled fields and acknowledgement email is dispatched
- Email webhook: given an unrecognised sender, assert no draft is created and rejection reply is sent
- Portal submission: given a complete form submission, assert project record is created, expected delivery date is calculated, and Super Admin is notified to assign a consultant
- Duplicate detection: given a second submission with the same PO number for the same org with an active project, assert duplicate is flagged and not processed as a new record
- Abandoned draft: given a draft with no activity for 14 days, assert it is moved to the Recovery Bin

**Template engine:**
- Given a .docx template with known placeholders and a field value map, assert the output .docx contains all expected substitutions and no unreplaced tokens remain
- Given a PBDB, assert all PBDR text transformations are applied correctly and watermark is removed from all document headers
- Given a valid .docx, assert Gotenberg returns a PDF and the file is stored correctly

**Template validation UI:**
- Given an uploaded .docx with unmapped placeholders, assert red flags are surfaced and template activation is blocked
- Given a fully mapped template, assert activation is permitted

**PBDB generation:**
- Given a consultant entering a project number, assert PBDB generation is triggered with all confirmed field values including the project number
- Given a consultant attempting to download before entering a project number, assert the download is blocked

**Approval flow:**
- Given a stakeholder clicking a valid approval token, assert the response is recorded with timestamp and attributed email
- Given a stakeholder clicking an expired token, assert access is denied and a re-send is surfaced to Super Admin
- Given all stakeholders acknowledging, assert PBDR conversion is triggered
- Given one stakeholder requesting modifications, assert all approvals reset and consultant is notified
- Given the 1-day buffer expiring, assert update emails fire to all stakeholders and direct follow-up with fresh token to non-responding stakeholder
- Given Super Admin waiving a stakeholder response, assert waiver reason is logged to audit trail and approval is recorded

**Payment gate:**
- Given a Credit Deduction client at PBDB dispatch with sufficient balance, assert balance is updated and deduction is logged
- Given a Credit Deduction client at dispatch with insufficient balance, assert PBDB is not dispatched and client is notified
- Given a Deferred client at dispatch within credit limit, assert dispatch proceeds and deduction is logged
- Given a Deferred client at dispatch with frozen account, assert dispatch is blocked
- Given a Super Admin override, assert the override is logged with reason and project is flagged
- Given PBDR conversion attempted without credit deduction logged, assert conversion is blocked

**Audit trail:**
- Given a payment override, assert audit log contains Super Admin identity, timestamp, and reason
- Given a stakeholder approval via tokenised link, assert log entry contains respondent email and timestamp
- Given a stakeholder waiver, assert log entry contains Super Admin identity, timestamp, and written reason

**Security:**
- Given a Client user without 2FA enrolled attempting login, assert access is denied
- Given an expired session cookie, assert deep link redirects to login
- Given a Consultant attempting to delete a client project, assert action is blocked
- Given a stakeholder approval token used a second time, assert the repeat submission is rejected

---

## Out of Scope

**Phase 2 backlog (not built in Phase 1):**

- **Xero integration:** Automatic invoice generation at PBDB dispatch, webhook-triggered payment confirmation, automatic token assignment on payment receipt. Phase 1 uses manual Super Admin token management.
- **In-system placeholder mapper:** Super Admin configures placeholder-to-field bindings inside OPS without manually editing the .docx. Phase 1 requires Super Admin to add placeholders to the .docx externally before uploading.
- **Access database auto-population:** OPS pushes project data into Microsoft Access automatically on job creation. Phase 1 requires Admin to manually create Access records for every OPS job.
- **Automated image extraction and insertion:** System extracts relevant plan views from uploaded building plan PDFs and inserts them into PBDB template at configured bookmark positions. See Open Tickets.
- **Consultant auto-assignment and round-robin rotation:** On project submission, system assigns the next available consultant automatically using a round-robin queue. Phase 1 uses manual Super Admin assignment.
- **Self-service credit purchase:** Client purchases credit packages directly via a payment gateway. Phase 1 credits are topped up manually by Super Admin after invoice payment is confirmed.

**Explicitly out of scope (not planned):**
- SMS notifications
- Microsoft Teams notifications
- Self-registration for client users (Super Admin creates all accounts)
- Non-volume-builder clients (OPS is exclusively for volume builders meeting the template eligibility criteria)
- Complex, non-repeatable Performance Solution reports (DDEG premium consultancy — not OPS)

---

## Further Notes

### Phase 2 Acceptance Criteria Targets

From the Desired Future State document, the following metrics are the Phase 2 success benchmarks:

| Metric | Phase 1 Target | Phase 2 Target |
|---|---|---|
| Admin time per OPS project | ≤ 10 min | ≤ 2 min |
| Consultant time per OPS project | ≤ 10 min | 0 min (exception-only) |
| Client emails required | ≤ 2–3 | ≤ 0 |
| Report turnaround | ≤ Expected delivery timeline per org | ≤ Expected delivery timeline per org |
| Submissions via portal | ≥ 98% | 100% |
| Project records auto-populated | Partial | 100% |
| Right-first-time submissions | ≥ 98% | 100% |

### Open Tickets

**[OPEN TICKET — FEASIBILITY STUDY REQUIRED]**
**Automated image extraction and insertion from building plans**

Goal: eliminate the manual image step from consultant QA entirely. The system should extract specific plan views (floor plan, elevations, sections) from uploaded building plan PDFs and programmatically insert them into the PBDB template at configured bookmark positions.

This is the single remaining step that prevents fully automated report generation. A feasibility study is required before this can be scoped for Phase 2 development. The study should evaluate:
- OCR and computer vision approaches for identifying and extracting specific plan views from architectural drawing PDFs
- Accuracy and reliability thresholds acceptable for professional document use
- Integration path with `docxtemplater` image bookmark insertion
- Fallback behaviour when extraction confidence is below threshold

This ticket must be completed before Phase 2 planning begins.

**[OPEN TICKET — IMPLEMENTATION SESSION REQUIRED]**
**Stockland template placeholder mapping**

The Stockland .docx template must be imported and all placeholder tokens extracted before any submission form, schema field additions, or PBDB generator code is written. This session will:
- Extract all placeholder tokens from the template
- Map each token to a form field (client-entered), a system field (project number, dates), or an org-level data source (stakeholder details, certifier metadata)
- Define OCR extraction targets for the Claude API
- Confirm the final submission form field list

This must be completed before Phase 1 development begins on the submission form or document generation modules.

### Pilot Client

Stockland / Halcyon Constructions QLD Pty Ltd is the Phase 1 pilot client. Every Stockland job uses one fixed template containing exactly two Performance Solutions:
- PS1: Alternate Window Head Flashing (NCC H1D7(4), H2D6(4), H2P2)
- PS2: Alternate Grading to External Areas (NCC H2D2(b), H2P1)

The certifier on Stockland jobs is GMA Certification Pty Ltd. The fee per report is $500 + GST per the Stockland Standing Offer Deed. Invoices are addressed to Halcyon Constructions QLD Pty Ltd and must reference the Purchase Order number.

### Project Scaffolding

#### Directory Structure

```
ops/
├── app/                                  # Next.js App Router
│   ├── (auth)/                           # Unauthenticated routes
│   │   ├── login/
│   │   ├── register/                     # Invite acceptance + profile completion
│   │   └── verify/                       # 2FA setup and verification
│   │
│   ├── (client)/                         # Client portal (role-gated)
│   │   ├── dashboard/                    # Project list, credit balance, delivery countdowns
│   │   ├── projects/
│   │   │   ├── new/                      # Submission form (upload + field confirmation)
│   │   │   └── [id]/                     # Project detail, status, stakeholder approval tray
│   │   ├── approvals/                    # Approval tray (pending acknowledgements)
│   │   ├── history/                      # Report History (delivered PBDRs)
│   │   ├── recovery/                     # Recovery Bin (30-day soft delete)
│   │   └── settings/                     # Account settings
│   │
│   ├── (consultant)/                     # Consultant portal (role-gated)
│   │   ├── dashboard/                    # Assigned projects, overdue indicators
│   │   ├── projects/
│   │   │   └── [id]/                     # QA workflow: project number entry, download, re-upload, mark complete
│   │   └── availability/                 # Set availability status
│   │
│   ├── (admin)/                          # Super Admin portal (role-gated)
│   │   ├── dashboard/                    # System overview, overrides pending, overdue projects
│   │   ├── organisations/
│   │   │   ├── new/                      # Create client org
│   │   │   └── [id]/                     # Org config: templates, credits, delivery timeline, payment method, stakeholders
│   │   ├── templates/
│   │   │   ├── upload/                   # Upload .docx + placeholder validation UI
│   │   │   └── [id]/                     # Mapping table, activation, deactivation
│   │   ├── consultants/                  # Consultant accounts, availability override
│   │   ├── credits/                      # Credit ledger, manual top-ups, deferred accounts
│   │   ├── audit/                        # Full event audit log, searchable/filterable
│   │   └── recovery/                     # All-org Recovery Bin view
│   │
│   └── api/                              # API route handlers
│       ├── webhooks/
│       │   ├── email/                    # Postmark inbound webhook receiver
│       │   └── payment/                  # Phase 2: Xero payment webhook
│       ├── projects/
│       │   ├── [id]/
│       │   │   ├── submit/               # Portal form submission
│       │   │   ├── assign/               # Consultant assignment (manual, Super Admin)
│       │   │   ├── project-number/       # Consultant enters project number → triggers PBDB generation
│       │   │   ├── qa/                   # QA upload + mark complete
│       │   │   ├── dispatch/             # PBDB dispatch to stakeholders
│       │   │   ├── approve/              # Stakeholder approval response (token-authenticated)
│       │   │   └── convert/              # PBDB → PBDR conversion trigger
│       ├── templates/
│       │   ├── upload/                   # Template .docx upload
│       │   ├── validate/                 # Placeholder parse + mapping validation
│       │   └── activate/                 # Template activation (post-validation)
│       ├── credits/
│       │   ├── topup/                    # Manual Super Admin top-up
│       │   ├── deduct/                   # Credit deduction at PBDB dispatch
│       │   └── override/                 # Super Admin payment gate override
│       ├── stakeholders/
│       │   ├── resend/                   # Re-send approval token to stakeholder
│       │   └── waive/                    # Super Admin waiver with mandatory reason
│       ├── notifications/                # Mark notification read, fetch unread
│       └── auth/                         # Session, 2FA, invite acceptance
│
├── components/
│   ├── ui/                               # Primitive components (buttons, inputs, modals, badges)
│   ├── forms/
│   │   ├── ProjectSubmissionForm/        # Multi-step submission form with extraction preview
│   │   ├── ApprovalForm/                 # Stakeholder acknowledgement / modifications form (token-authenticated)
│   │   └── TemplateMappingForm/          # Placeholder-to-field binding UI for Super Admin
│   ├── dashboard/
│   │   ├── ProjectCard/                  # Project status card with delivery countdown
│   │   ├── CreditBalance/                # Credit balance widget
│   │   ├── NotificationTray/             # In-app notification bell + tray
│   │   └── AuditLogTable/                # Searchable audit log table (Super Admin)
│   └── documents/
│       └── DocumentUploadZone/           # Drag-and-drop file upload with validation
│
├── lib/
│   ├── documents/
│   │   ├── generator.ts                  # docxtemplater find-and-replace execution
│   │   ├── converter.ts                  # PBDB → PBDR text transformations + watermark removal via PizZip
│   │   ├── pdf.ts                        # Gotenberg HTTP client for .docx → PDF
│   │   ├── validator.ts                  # Template placeholder parse + mapping validation
│   │   └── naming.ts                     # PBDR file naming + address sanitisation
│   │
│   ├── email/
│   │   ├── sender.ts                     # Resend dispatch wrapper
│   │   ├── parser.ts                     # Postmark inbound payload parser
│   │   ├── extractor.ts                  # Claude API field extraction from uploaded documents
│   │   └── templates/                    # React Email components
│   │       ├── AcknowledgementEmail.tsx
│   │       ├── ApprovalRequestEmail.tsx
│   │       ├── ModificationsRequestedEmail.tsx
│   │       ├── PBDRDeliveryEmail.tsx
│   │       ├── CreditDeductionEmail.tsx
│   │       └── LowCreditEmail.tsx
│   │
│   ├── jobs/                             # pg-boss background job definitions
│   │   ├── queue.ts                      # pg-boss client initialisation
│   │   ├── generate-pbdb.ts              # PBDB generation on project number entry
│   │   ├── dispatch-pbdb.ts              # PBDB email dispatch + credit deduction
│   │   ├── approval-buffer.ts            # 1-day buffer timer + stakeholder follow-up
│   │   ├── convert-pbdr.ts               # Atomic PBDB → PBDR conversion + PDF generation
│   │   ├── deliver-pbdr.ts               # PBDR email delivery to submitter + delivery recipient
│   │   ├── expire-draft.ts               # 14-day abandoned draft → Recovery Bin
│   │   └── purge-recovery-bin.ts         # 30-day auto-purge of soft-deleted items
│   │
│   ├── credits/
│   │   ├── deduct.ts                     # Credit deduction logic + ledger write (payment-method-aware)
│   │   ├── topup.ts                      # Manual top-up logic
│   │   └── gate.ts                       # PBDR release gate verification
│   │
│   ├── audit/
│   │   └── log.ts                        # Audit event writer (all significant actions)
│   │
│   ├── notifications/
│   │   └── notify.ts                     # Unified notification dispatch (email + dashboard)
│   │
│   ├── stakeholders/
│   │   └── tokens.ts                     # Approval token generation, validation, expiry
│   │
│   └── auth/
│       ├── session.ts                    # Session timeout enforcement (8hr / 4hr)
│       └── invite.ts                     # Invite token generation and validation
│
├── supabase/
│   ├── migrations/                       # Versioned SQL migrations
│   └── seed.ts                           # Dev seed data (Stockland org, template, test users)
│
├── types/
│   ├── project.ts                        # Project, ProjectStatus, ProjectFile types
│   ├── template.ts                       # Template, PlaceholderMapping types
│   ├── user.ts                           # User, Role, OrgMembership types
│   ├── stakeholder.ts                    # OrgStakeholder, ApprovalToken types
│   ├── credits.ts                        # CreditLedgerEntry, PaymentMethod types
│   ├── audit.ts                          # AuditEvent types
│   └── jobs.ts                           # Job payload types for pg-boss
│
├── middleware.ts                         # Edge middleware: session validation, 2FA enforcement, role-gating
├── railway.toml                          # Railway deployment config (web + worker services)
└── docker-compose.yml                    # Local dev: Gotenberg + Supabase
```

#### Database Schema

```sql
-- Organisations (client accounts)
organisations
  id uuid PK
  name text
  payment_method enum('upfront', 'deferred', 'credit_deduction')
  credit_balance integer DEFAULT 0
  credit_limit integer                    -- deferred billing cap
  delivery_working_days integer DEFAULT 5 -- expected delivery timeline, org-specific
  state_territory text                    -- for public holiday calendar
  abandoned_draft_days integer DEFAULT 14 -- days before inactive email drafts move to Recovery Bin
  is_frozen boolean DEFAULT false
  email_whitelist text[]                  -- allowed sender domains for webhook
  created_at timestamptz
  updated_at timestamptz

-- Users
users
  id uuid PK
  email text UNIQUE
  first_name text
  last_name text
  phone text
  company_role text
  state_territory text
  role enum('client', 'consultant', 'super_admin')
  org_id uuid FK → organisations          -- null for consultant/admin
  availability enum('available', 'on_leave', 'at_capacity')  -- consultant only
  is_locked boolean DEFAULT false
  totp_enabled boolean DEFAULT false
  invited_at timestamptz
  created_at timestamptz

-- Org-level stakeholders (default for all projects in the org)
org_stakeholders
  id uuid PK
  org_id uuid FK → organisations
  name text
  email text
  company text
  metadata jsonb                          -- licence number, address, etc.
  is_active boolean DEFAULT true
  created_at timestamptz

-- Template-level stakeholder overrides
template_stakeholders
  id uuid PK
  template_id uuid FK → templates
  name text
  email text
  company text
  metadata jsonb
  is_active boolean DEFAULT true
  created_at timestamptz

-- Project-level stakeholder overrides
project_stakeholders
  id uuid PK
  project_id uuid FK → projects
  name text
  email text
  company text
  metadata jsonb
  is_active boolean DEFAULT true
  created_at timestamptz

-- Approval tokens (tokenised deep links for stakeholder approval)
approval_tokens
  id uuid PK
  project_id uuid FK → projects
  review_cycle integer                    -- matches stakeholder_reviews.review_cycle
  stakeholder_email text
  token text UNIQUE
  expires_at timestamptz
  used_at timestamptz                     -- null until submitted
  created_at timestamptz

-- Templates
templates
  id uuid PK
  org_id uuid FK → organisations
  name text
  storage_path text                       -- Supabase Storage path to .docx
  status enum('pending_validation', 'active', 'inactive')
  created_by uuid FK → users             -- Super Admin who uploaded
  created_at timestamptz

-- Template placeholder mappings
template_field_mappings
  id uuid PK
  template_id uuid FK → templates
  placeholder_token text                  -- e.g. {{SITE_ADDRESS}}
  field_key text                          -- e.g. 'site_address'
  is_mapped boolean DEFAULT false
  created_at timestamptz

-- Projects
projects
  id uuid PK
  org_id uuid FK → organisations
  template_id uuid FK → templates
  submitted_by uuid FK → users
  assigned_consultant uuid FK → users
  status enum(
    'draft', 'submitted', 'assigned', 'qa_in_progress',
    'qa_complete', 'dispatched_for_review', 'approved',
    'converting', 'delivered', 'complete'
  )
  site_address text
  project_number text                     -- DDEG internal number, entered by consultant at QA
  po_number text                          -- client Purchase Order number, used for duplicate detection
  delivery_due_at timestamptz             -- expected delivery date (calculated at submission)
  delivery_recipient_email text           -- optional additional PBDR recipient
  credit_deducted boolean DEFAULT false
  credit_deducted_at timestamptz
  payment_override boolean DEFAULT false
  payment_override_reason text
  payment_override_by uuid FK → users
  deleted_at timestamptz                  -- soft delete (Recovery Bin)
  created_at timestamptz
  updated_at timestamptz

-- Project files
project_files
  id uuid PK
  project_id uuid FK → projects
  file_type enum('purchase_order', 'building_plans', 'pbdb', 'pbdr')
  storage_path text
  version integer DEFAULT 0
  checksum text
  uploaded_by uuid FK → users
  created_at timestamptz

-- Stakeholder reviews
stakeholder_reviews
  id uuid PK
  project_id uuid FK → projects
  review_cycle integer DEFAULT 1          -- increments on each approval reset
  stakeholder_email text                  -- attributed email (token issued to this address)
  outcome enum('pending', 'acknowledged', 'modifications_requested')
  comments text
  responded_at timestamptz
  created_at timestamptz

-- Credit ledger
credit_ledger
  id uuid PK
  org_id uuid FK → organisations
  project_id uuid FK → projects           -- nullable (top-ups have no project)
  event_type enum('topup', 'deduction', 'override', 'adjustment')
  amount integer                          -- positive = credit, negative = deduction
  balance_after integer
  performed_by uuid FK → users           -- Super Admin for manual entries
  notes text
  created_at timestamptz

-- Audit log
audit_log
  id uuid PK
  event_type text                         -- e.g. 'pbdr.delivered', 'payment.override', 'approval.submitted', 'stakeholder.waived'
  actor_id uuid FK → users               -- nullable for stakeholder actions
  actor_email text                        -- denormalised; covers both users and external stakeholders
  project_id uuid FK → projects          -- nullable
  org_id uuid FK → organisations         -- nullable
  metadata jsonb                          -- event-specific payload (override reason, gate state, waiver reason, etc.)
  created_at timestamptz

-- In-app notifications
notifications
  id uuid PK
  recipient_id uuid FK → users
  project_id uuid FK → projects          -- nullable
  type text                              -- maps to notification event type
  message text
  is_read boolean DEFAULT false
  created_at timestamptz
```

#### Railway Services

```
ops-web      → Next.js application (main web + API routes)
ops-worker   → pg-boss job worker (background jobs, approval buffer timers, email dispatch)
ops-pdf      → Gotenberg Docker service (.docx → PDF conversion)
```

All three services deploy from the same Railway project. `ops-web` and `ops-worker` share the same Next.js codebase (worker entry point at `worker.ts`); `ops-pdf` runs the official `gotenberg/gotenberg` Docker image with LibreOffice enabled. All connect to the same Supabase PostgreSQL instance.

#### Environment Variables

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY

# Resend (email sending)
RESEND_API_KEY
EMAIL_FROM_ADDRESS

# Postmark (email inbound)
POSTMARK_WEBHOOK_TOKEN
OPS_INBOUND_EMAIL_ADDRESS

# Gotenberg (PDF conversion)
GOTENBERG_URL                   # internal Railway service URL

# Claude API (field extraction)
ANTHROPIC_API_KEY

# App
NEXT_PUBLIC_APP_URL             # public-facing URL for deep links
```

### Business Context

OPS is a separate commercial product from DDEG's premium consultancy. It is deliberately priced at $250–$500 per report to capture volume builder work that has historically been inaccessible due to the cost of bespoke consultancy. DDEG retains its premium positioning for complex, non-templatable work. OPS is the high-volume, low-margin product line that generates cash flow and opens doors to volume builder relationships that subsequently lead to premium work.

---

## Open Issues

### Issue: PBDR PDF Cover Page Formatting — LibreOffice Rendering Fidelity

**Status:** Unresolved — decision pending

**Description:**

The PBDB→PBDR conversion pipeline sends a `.docx` file to Gotenberg (LibreOffice) for PDF rendering. The resulting PDF has two formatting defects compared to the source Word document:

1. **White cover block disappears.** The cover page uses a floating text box with a white fill positioned over the full-bleed background photo. LibreOffice drops the white fill on floating shapes that overlap images. The text (logo, title, address fields) still renders but floats directly over the photo with no background.

2. **Address text wraps.** The single-line address in the cover info block wraps to two lines in the PDF. Caused by font substitution — the Gotenberg container does not have Microsoft fonts installed, so LibreOffice substitutes a metrically different open-source font that is fractionally wider.

The cover page is not static: it contains dynamic fields (`EXTRACT_ADDRESS`, `PROJECT_NO`, `SYS_GEN_DATE`, `SYS_REV_NO`) populated per project by docxtemplater before conversion.

**Options:**

**Option A — Restructure the Word template**

Modify the cover page in the `.docx` template to replace the floating text box with an inline table that has a white cell background. Inline tables with cell background fills render reliably in LibreOffice. The dynamic fields remain in place; only the container element changes. Also embed Microsoft fonts in the template file (*Word → Save Options → Embed fonts in the file*) to eliminate the font substitution issue.

- No code changes required.
- Requires template maintainer to restructure the cover page in Word.
- Risk: manual restructuring of a designed cover page may disturb the visual layout; needs careful testing.

**Option B — HTML cover page + PDF merge**

Generate the cover page separately as an HTML template (injecting the same dynamic fields: address, project number, date, revision). Render it to a 1-page PDF via Gotenberg's Chromium endpoint (not LibreOffice), which gives pixel-perfect rendering independent of font availability. Merge the Chromium-rendered cover PDF with the LibreOffice-converted body pages using Gotenberg's `/forms/pdfengines/merge` endpoint. The Word template cover page is removed or left blank so it does not appear in the merged output.

- Requires new code: HTML cover template, updated `pdf.ts` to run two Gotenberg calls + merge.
- The Word template itself does not need structural changes.
- Cover fidelity is fully controlled in code; no LibreOffice involvement for that page.
- Risk: HTML cover must be kept visually in sync with any future cover design changes.

The initial addressable market is Australian volume builders constructing approximately 120,000 homes per year who have never engaged Performance Solution consultants because of cost and friction. Stockland (500 retirement village homes in Year 1) is the entry point. 5,000 jobs per year is the stated upside target.
