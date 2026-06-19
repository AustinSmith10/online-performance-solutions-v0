# OPS QA Plan — Issues #7–14

**Generated:** 2026-06-15  
**Covers:** Issues #7 (Payment Gate & Credits), #8 (Audit Trail), #9 (Template Upload), #10 (Client Portal Submission), #11 (Delivery Timeline), #12 (Email Webhook), #13 (Dashboards), #14 (Recovery Bin)

---

## How to use this document

Every test is labelled `**[AUTOMATED]`** or `**[MANUAL]`**.

- `**[AUTOMATED]`** — run the listed command in terminal; check the output. No browser needed.
- `**[MANUAL]`** — requires browser interaction. Step-by-step instructions are provided.

Fill in the **Result** field for each test with one of:

- `PASS` — works as expected
- `FAIL` — does not work; add detail in Notes
- `BLOCKED` — cannot test (missing env var, missing setup); note why
- `N/A` — not applicable in this environment

---

## Setup

**What you need to run this QA plan:**

1. `.env.local` with your Supabase credentials, plus these additional keys:
  - `ANTHROPIC_API_KEY` — required for issues #10 and #12 (Claude field extraction)
  - `RESEND_API_KEY` — required for notification email tests (#10, #12, #13)
  - `POSTMARK_INBOUND_HASH` — required for issue #12 MailboxHash threading test only
2. `npm run dev` running in terminal
3. Supabase cloud dashboard open at `https://supabase.com/dashboard`

Mark any test as **BLOCKED** if a required env var is missing.

> **Gotenberg / Docker:** Not required for issues #7–#13. Issue #14 (Recovery Bin) does not need Gotenberg either. It first becomes relevant at issue #15 (PBDB generation). See the [Docker footnote](#docker-footnote) at the bottom of this document.

---

## Test accounts

Same seed accounts as QA Plan 1. Run `npx tsx supabase/seed.ts` if starting fresh.


| Role        | Email                                             | Password       | Extra                         |
| ----------- | ------------------------------------------------- | -------------- | ----------------------------- |
| Super Admin | [admin@ops.test](mailto:admin@ops.test)           | Ops@TestPass1! |                               |
| Consultant  | [consultant@ops.test](mailto:consultant@ops.test) | Ops@TestPass1! | Available — Test Consultant   |
| Client      | [client@ops.test](mailto:client@ops.test)         | Ops@TestPass1! | Stockland org                 |
| Client      | [client2@ops.test](mailto:client2@ops.test)       | Ops@TestPass1! | Stockland org — Emma Davis    |
| Client      | [client3@ops.test](mailto:client3@ops.test)       | Ops@TestPass1! | Stockland org — Ryan Thompson |


**Stockland org:** payment method `credit_deduction`, credit balance 100.

**Additional orgs needed for issue #7 tests:** Create a `deferred` and an `upfront` org via Super Admin before running tests 7-005 through 7-007. Instructions in 7-005.

**Dummy project:** OPS-0001 (status: submitted, assigned — from QA Plan 1 run). If unavailable, create a new submission following tests 10-001 through 10-007 first.

---

---

# AUTOMATED CHECKS

---

### A-001 · TypeScript — zero compile errors `[AUTOMATED]`

**Command:**

```bash
npm run type-check
```

**How to interpret:** No output = PASS. Any line starting with a file path = FAIL.


| Last Result | Re-run Result | Notes |
| ----------- | ------------- | ----- |
| PASS        | PASS          |       |


---

### A-002 · ESLint — zero errors `[AUTOMATED]`

**Command:**

```bash
npm run lint
```

**How to interpret:** "0 errors" = PASS. Warnings acceptable.


| Last Result | Re-run Result | Notes |
| ----------- | ------------- | ----- |
| PASS        | PASS          |       |


---

### A-003 · All 14 database migrations present `[AUTOMATED]`

**Command:**

```bash
ls supabase/migrations/ | wc -l
```

**How to interpret:** Output must be `14`.


| Last Result | Re-run Result | Notes                                                                                                                                         |
| ----------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| PASS(14)    | PASS(26)      | Count has grown to 26 as new migrations have been added (audit log trigger, project status refactor, etc). Test criteria updated accordingly. |


---

### A-004 · Worker registers both scheduled jobs `[AUTOMATED]`

**Command:**

```bash
grep -c "boss.schedule" worker.ts
```

**How to interpret:** Output must be `2` (one for `expire-draft`, one for `purge-recovery-bin`).


| Last Result | Re-run Result | Notes |
| ----------- | ------------- | ----- |
| PASS(2)     | PASS(2)       |       |


---

### A-005 · Email parser module loads without errors `[AUTOMATED]`

**Command:**

```bash
npx tsx -e "import('./lib/email/parser').then(() => console.log('parser: OK'))"
```

**How to interpret:** Output `parser: OK` = PASS. Any error = FAIL.


| Last Result | Re-run Result | Notes |
| ----------- | ------------- | ----- |
| PASS        | PASS          |       |


---

### A-006 · Webhook route is on the public path list `[AUTOMATED]`

**Command:**

```bash
grep "webhooks/email" proxy.ts
```

**How to interpret:** Output must include `/api/webhooks/email`. Empty output = FAIL (webhook would be auth-gated).


| Last Result | Re-run Result | Notes |
| ----------- | ------------- | ----- |
| PASS        | PASS          |       |


---

---

# ISSUE #7 — Payment gate & credit system

> **Session setup:** Log in as `admin@ops.test`. Keep Supabase dashboard open → **Table Editor** — you will need to check the `credit_ledger` table throughout these tests.

---

### 7-001 · Credit management page lists all orgs `[MANUAL]`

**Pre-conditions:** Logged in as `admin@ops.test`. Seed run.

**Steps:**

1. Navigate to `http://localhost:3000/admin/credits`.
2. Observe the list.

**Expected:** All seeded orgs are listed. Stockland shows a credit balance of 100.


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### 7-002 · Super Admin can manually top up a credit balance `[MANUAL]`

**Pre-conditions:** On `/admin/credits`. Stockland balance is 100.

**Steps:**

1. Click on **Stockland** to open its credit management page (`/admin/credits/[id]`).
2. Find the **Top up** form and enter: `50`
3. Add a note: `QA test top-up`
4. Click **Top up**.
5. Observe the displayed balance.

**Expected:** Balance updates to 150. A success confirmation is displayed.


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### 7-003 · Top-up creates a credit_ledger row `[MANUAL]`

**Pre-conditions:** 7-002 completed.

**Steps:**

1. Open Supabase dashboard → **Table Editor** → `credit_ledger` table.
2. Sort by `created_at` descending.
3. Read the most recent row.

**Expected:** A row exists with:

- `org_id` = Stockland's UUID
- `event_type = "top_up"` (or similar)
- `amount = 50`
- `balance_after = 150`
- `notes = "QA test top-up"`
- `performed_by` = admin user's UUID


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### 7-004 · Credit balance and ledger visible on org credit page `[MANUAL]`

**Pre-conditions:** 7-003 completed. On Stockland's credit page (`/admin/credits/[id]`).

**Steps:**

1. Scroll down the page.
2. Look for a ledger or transaction history section below the current balance.

**Expected:** Current balance (150) is shown prominently. A table of ledger entries lists the top-up from 7-002 with its timestamp, amount, and note.


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### 7-005 · Create a deferred org for payment tests `[MANUAL]`

**Pre-conditions:** Logged in as `admin@ops.test`.

**Steps:**

1. Navigate to `http://localhost:3000/admin/organisations/new`.
2. Fill in:
  - **Name:** `Test Deferred Org`
  - **Payment method:** `deferred`
  - **Delivery working days:** `5`
  - **State/territory:** `QLD`
3. Click **Create**.
4. Note the new org's ID from the URL or Supabase dashboard.

**Expected:** Org created. `payment_method = "deferred"` in the `organisations` table.


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### 7-006 · Freeze a deferred account blocks it `[MANUAL]`

**Pre-conditions:** 7-005 completed. On `Test Deferred Org`'s detail page in `/admin/organisations`.

**Steps:**

1. Navigate to the `Test Deferred Org` org detail page.
2. Find the **Freeze account** button and click it.
3. Open Supabase dashboard → `organisations` → find `Test Deferred Org` → read `is_frozen`.

**Expected:** `is_frozen = true` in DB. The button label changes to **Unfreeze account**.


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### 7-007 · Payment override requires written reason `[MANUAL]`

**Pre-conditions:** A project exists that is in a payment-pending state, OR test via the admin credits page override action. Logged in as `admin@ops.test`.

**Steps:**

1. Open OPS-0001's admin detail page at `http://localhost:3000/admin/projects/[OPS-0001-UUID]`.
2. Look for a **Payment override** or **Override payment gate** action.
3. Click it **without** entering a reason.
4. Observe the result.
5. Now enter a reason: `QA testing override approval` and confirm.
6. Check Supabase dashboard → `audit_log` table for a new row.

**Expected:** Clicking without a reason shows a validation error — the form does not submit. With a reason entered, the override succeeds. An `audit_log` row exists with `event_type` containing `payment` or `override`, and `metadata` containing the reason text.


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### 7-008 · Overridden project shows "Override — Payment Pending" badge `[MANUAL]`

**Pre-conditions:** 7-007 completed. OPS-0001 has a payment override applied.

**Steps:**

1. Navigate to `http://localhost:3000/admin/projects`.
2. Find OPS-0001 in the list.
3. Observe the status/badge area.
4. Also open OPS-0001's detail page and look for the same badge.

**Expected:** "Override — Payment Pending" badge is visible in both the list and the detail view.


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### 7-009 · Clearing a payment override removes the badge `[MANUAL]`

**Pre-conditions:** 7-008 completed.

**Steps:**

1. On OPS-0001's admin detail page, find the action to clear/reconcile the payment override.
2. Click it and confirm.
3. Return to `/admin/projects` and observe OPS-0001.

**Expected:** "Override — Payment Pending" badge is gone. The project no longer appears in any override-pending list.


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### 7-010 · Client cannot access the credits admin page `[MANUAL]`

**Pre-conditions:** Logged in as `client@ops.test`.

**Steps:**

1. Navigate to `http://localhost:3000/admin/credits`.

**Expected:** Redirected away — the credits page does not load for a client.


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### 7-011 · Consultant cannot access the credits admin page `[MANUAL]`

**Pre-conditions:** Logged in as `consultant@ops.test`.

**Steps:**

1. Navigate to `http://localhost:3000/admin/credits`.

**Expected:** Redirected away — the credits page does not load for a consultant.


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

---

# ISSUE #8 — Audit trail

> **Session setup:** Log in as `admin@ops.test`. Keep Supabase dashboard open → **Table Editor** → `audit_log` table. Trigger some actions in earlier issues first if the log is empty.

---

### 8-001 · audit_log RLS blocks DELETE `[MANUAL]`

**Pre-conditions:** Supabase dashboard open. At least one row exists in `audit_log`.

**Steps:**

1. Open Supabase dashboard → **Table Editor** → `audit_log`.
2. Select any row by clicking its checkbox.
3. Click the **Delete row** button (or try via the row menu).
4. Attempt to confirm the deletion.

**Expected:** The deletion is blocked or an error is shown. The row still exists after the attempt. (If the Supabase dashboard blocks this at the UI level, confirm by checking the RLS policy instead: go to **Authentication** → **Policies** → `audit_log` and verify no DELETE policy exists for any role.)


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### 8-002 · audit_log RLS blocks UPDATE `[MANUAL]`

**Pre-conditions:** Supabase dashboard open. At least one row exists in `audit_log`.

**Steps:**

1. In the `audit_log` table, click on any cell to try editing it.
2. Attempt to change any value and save.

**Expected:** The edit is rejected. Alternatively, confirm via **Authentication** → **Policies** → `audit_log`: no UPDATE policy exists for any role.


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### 8-003 · Triggering an action writes an audit_log row `[MANUAL]`

**Pre-conditions:** Logged in as `admin@ops.test`. Note the current row count in `audit_log` before starting.

**Steps:**

1. Assign (or reassign) a consultant to OPS-0001 via `http://localhost:3000/admin/projects/[OPS-0001-UUID]`.
2. Open Supabase dashboard → `audit_log`.
3. Sort by `created_at` descending.
4. Read the most recent row.

**Expected:** A new row was written with:

- `event_type` containing `assign` or `consultant`
- `actor_email` = `admin@ops.test`
- `project_id` = OPS-0001's UUID
- `created_at` within the last minute


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### 8-004 · Super Admin can view the audit log `[MANUAL]`

**Pre-conditions:** Logged in as `admin@ops.test`. At least one audit_log row exists.

**Steps:**

1. Navigate to `http://localhost:3000/admin/audit`.
2. Observe the page.

**Expected:** A table of audit log entries is displayed with columns for at minimum: event type, actor, timestamp, and a link to the related project (if any). The most recent entry appears at the top.


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### 8-005 · Audit log filter — by actor email `[MANUAL]`

**Pre-conditions:** 8-004 passed. Multiple actors have entries in the log.

**Steps:**

1. On `/admin/audit`, find the **Actor email** filter field.
2. Enter: `admin@ops.test`
3. Submit or wait for the filter to apply.
4. Inspect the returned rows.

**Expected:** Only rows where `actor_email = "admin@ops.test"` are shown. No rows from other actors appear.


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### 8-006 · Audit log filter — by event type `[MANUAL]`

**Pre-conditions:** 8-004 passed.

**Steps:**

1. On `/admin/audit`, find the **Event type** filter.
2. Select or type an event type that exists in the log (e.g. `consultant_assigned` or `email.draft_created`).
3. Apply the filter.

**Expected:** Only rows matching that event type are shown.


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### 8-007 · Audit log — no edit controls visible `[MANUAL]`

**Pre-conditions:** On `/admin/audit`.

**Steps:**

1. Look at each row in the audit log table.
2. Check for edit buttons, pencil icons, or inline editable cells.

**Expected:** No edit or delete controls are present. The log is read-only from the UI.


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### 8-008 · Client cannot access the audit log page `[MANUAL]`

**Pre-conditions:** Logged in as `client@ops.test`.

**Steps:**

1. Navigate to `http://localhost:3000/admin/audit`.

**Expected:** Redirected away — the audit page does not load for a client.


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

---

# ISSUE #9 — Template upload, placeholder validation & activation

> **Session setup:** Log in as `admin@ops.test`. You need a `.docx` file containing OPS placeholder tokens for these tests. Use the Stockland PBDB template if available. If not, create a minimal test `.docx` in Word/Google Docs containing the text `{CLIENT_ADDRESS}` and `{EXTRACT_HOUSE_TYPE}` and save it as `test_template.docx`.

---

### 9-001 · Template upload page loads `[MANUAL]`

**Pre-conditions:** Logged in as `admin@ops.test`.

**Steps:**

1. Navigate to `http://localhost:3000/admin/templates`.
2. Click **Upload template** or navigate to `http://localhost:3000/admin/templates/upload`.

**Expected:** An upload page loads with a file input (or drag-and-drop zone) that accepts `.docx` files, and an **Org** selector.


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### 9-002 · Non-.docx file is rejected `[MANUAL]`

**Pre-conditions:** On the template upload page.

**Steps:**

1. Try to upload a `.pdf` or `.txt` file.

**Expected:** An error is shown: file type not supported. No upload proceeds.


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### 9-003 · Valid .docx is uploaded and stored `[MANUAL]`

**Pre-conditions:** On the template upload page. Have `test_template.docx` (or the Stockland PBDB template) ready.

**Steps:**

1. Select **Stockland** as the org.
2. Upload the `.docx` file.
3. Click **Upload** / **Continue**.
4. Open Supabase dashboard → **Storage** → `submissions` (or the template storage bucket) → navigate to the Stockland org folder.

**Expected:** The `.docx` file appears in storage. You are redirected to a mapping/validation view. A new row exists in the `templates` table with `status = "inactive"` (or `pending`).


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### 9-004 · Placeholder tokens are extracted and listed `[MANUAL]`

**Pre-conditions:** 9-003 completed. On the template detail/mapping page.

**Steps:**

1. Observe the token mapping table.

**Expected:** All `{TOKEN}` placeholders found in the `.docx` are listed. For the Stockland template, you should see at minimum: `{CLIENT_ADDRESS}`, `{EXTRACT_HOUSE_TYPE}`, `{EXTRACT_SITE_WD_NO}`, `{ORG_CERTIFIER_NAME}`, `{PROJECT_NO}`, `{SYS_GEN_DATE}`.


| Result | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PASS   | CLIENT_ADDRESS is not a .docx token it's captured via the submission form; token validation is auto-detected by prefix, there is no manual mapping dropdown. ~~**This is an issue, the supabase does not update the table if a template token is updated. It does not remove the old token or it is hardcoded.**~~ **Investigated — not a bug.** Re-upload path in `templates.ts` deletes all existing `template_field_mappings` for the template before re-inserting from the new .docx. Old tokens are fully purged on every re-upload. |


---

### 9-005 · Unmapped tokens flagged red `[MANUAL]`

**Pre-conditions:** 9-004 completed. No field mappings confirmed yet.

**Steps:**

1. Observe the token mapping table without changing anything.

**Expected:** Any token with no field key mapped shows a **red** flag or a red indicator. The **Activate** button is disabled.


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### 9-006 · Required field with no token flagged yellow `[MANUAL]`

**Pre-conditions:** 9-004 completed.

**Steps:**

1. Look through the mapping table for any field that is listed as required but has no matching `{TOKEN}` in the uploaded document.
2. Note its visual indicator colour.

**Expected:** Required fields with no matching token are highlighted in **yellow** (warning). Red = missing token mapping; yellow = missing required field in doc.


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### 9-007 · Activation blocked while red flags exist `[MANUAL]`

**Pre-conditions:** 9-005 confirmed red flags exist.

**Steps:**

1. Without resolving any red flags, attempt to click the **Activate** button.

**Expected:** Button is disabled or click produces an error: "Resolve all unmapped tokens before activating."


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### 9-008 · Template activates once all red flags resolved `[MANUAL]`

**Pre-conditions:** On the template mapping page. At least one token is unmapped (red).

**Steps:**

1. For each red-flagged token, select the correct field key from the dropdown.
2. Once all tokens are mapped (no red flags remain), click **Activate**.
3. Open Supabase dashboard → `templates` table → find this template → read `status`.

**Expected:** Template status changes to `active`. You are redirected to `/admin/templates` and the template appears with an "Active" badge.


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### 9-009 · Single active template is auto-selected at submission `[MANUAL]`

**Pre-conditions:** 9-008 completed. Exactly one active template exists for Stockland. Logged in as `client@ops.test`.

**Steps:**

1. Navigate to `http://localhost:3000/portal/submit`.
2. Observe the first step — specifically whether a "Report type" dropdown is shown.

**Expected:** No "Report type" dropdown is shown — the single active template is selected silently. The form proceeds directly to file upload.


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### 9-010 · Deactivated template is preserved `[MANUAL]`

**Pre-conditions:** 9-008 completed. The template is active.

**Steps:**

1. Navigate to `http://localhost:3000/admin/templates`.
2. Click on the active template.
3. Find and click the **Deactivate** button.
4. Open Supabase dashboard → `templates` table → confirm `status = "inactive"`.
5. Check that the template row still exists (it has not been deleted).

**Expected:** Template is deactivated but not deleted. Historical projects that reference this template still link to it.

> **Cleanup:** Reactivate the template after this test if you need it for submission tests.


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

---

# ISSUE #10 — Client portal submission

> **Session setup:** Log in as `client@ops.test`. Have a PDF ready as a sample building plan (any PDF works). Have a second PDF or image as a sample PO. `ANTHROPIC_API_KEY` must be set in `.env.local` for extraction tests — mark extraction tests as BLOCKED if unavailable. An active Stockland template is required (from issue #9).

---

### 10-001 · "New Report Request" navigates to submission form `[MANUAL]`

**Pre-conditions:** Logged in as `client@ops.test`.

**Steps:**

1. Navigate to `http://localhost:3000/portal`.
2. Click **New Report Request** (or equivalent button on the dashboard).

**Expected:** Navigated to `/portal/submit`. The first step of the submission form is visible (file upload zone).


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### 10-002 · File upload — missing building plans is blocked `[MANUAL]`

**Pre-conditions:** On `/portal/submit`.

**Steps:**

1. Leave both file upload zones empty.
2. Click **Next** or **Upload**.

**Expected:** A validation error is shown: building plans are required. The form does not advance.


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### 10-003 · Files upload and extraction runs `[MANUAL]`

**Pre-conditions:** On `/portal/submit`. Have a sample PDF ready.

**Steps:**

1. Upload any PDF as **Building plans**.
2. Optionally upload a second PDF as **Purchase Order**.
3. Click **Upload** / **Extract**.
4. Wait for the spinner to finish (extraction calls Claude — may take 5–15 seconds).

**Expected:** Step 2 loads showing a form with pre-filled fields. Fields that Claude extracted with high confidence are filled; low-confidence fields may be blank or flagged.

> Mark as **BLOCKED** if `ANTHROPIC_API_KEY` is missing. Step 2 still loads but fields will be empty.


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### 10-004 · Draft project is created in DB after extraction `[MANUAL]`

**Pre-conditions:** 10-003 completed. Step 2 of the submission form is visible.

**Steps:**

1. Open Supabase dashboard → **Table Editor** → `projects` table.
2. Sort by `created_at` descending.
3. Read the most recent row for `client@ops.test`'s org.

**Expected:** A row exists with `status = "draft"` and `submitted_by` = `client@ops.test`'s UUID. `extracted_fields` is populated (not null).


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### 10-005 · Client can edit extracted fields before submitting `[MANUAL]`

**Pre-conditions:** 10-003 completed. On step 2 of the submission form.

**Steps:**

1. Find any field on the review form (e.g. **Client address**).
2. Clear its current value and type: `123 QA Test Street, Brisbane QLD 4000`
3. Proceed to submit without changing anything else.

**Expected:** The edited value is preserved through to submission. After submitting, the project record in DB reflects `123 QA Test Street, Brisbane QLD 4000` as the client address.


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### 10-006 · Successful submission creates project in submitted status `[MANUAL]`

**Pre-conditions:** 10-003 completed. All required fields are populated on step 2.

**Steps:**

1. Scroll to the bottom of the review form.
2. In **Also send final report to**, enter: `extra@recipient.test` (optional — tests delivery_recipient_email)
3. Click **Submit**.
4. Wait for the redirect.
5. Open Supabase dashboard → `projects` table → find the just-submitted project → read `status` and `delivery_recipient_email`.

**Expected:** Redirected to `/portal/projects/[id]`. The project detail page shows **Submitted** status. In DB: `status = "submitted"` and `delivery_recipient_email = "extra@recipient.test"`.


| Result | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PASS   | ~~Issue, can submit without certain fields. Need to identify how to toggle on required for each field token.~~ **Investigated — not a bug.** Required field enforcement is implemented on both client (HTML `required` attribute + red asterisk) and server (`submission.ts` checks `is_required = true` tokens and returns a named error). At time of test no tokens were marked `is_required = true` in the template mapping page. Mark tokens as required via the admin template mapping UI to enforce them at submission. |


---

### 10-007 · Super Admin receives notification on new submission `[MANUAL]`

**Pre-conditions:** 10-006 completed.

**Steps:**

1. Log in (or switch to) `admin@ops.test`.
2. Open Supabase dashboard → `notifications` table → sort by `created_at` descending.
3. Check the most recent row.

**Expected:** A notification row exists with `recipient_id` = admin's UUID and a message containing the new project or org name. `is_read = false`.

> If `RESEND_API_KEY` is configured, also check your Resend dashboard for a "New submission" email to [admin@ops.test](mailto:admin@ops.test).


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### 10-008 · Client receives confirmation notification `[MANUAL]`

**Pre-conditions:** 10-006 completed.

**Steps:**

1. Open Supabase dashboard → `notifications` table.
2. Look for a row where `recipient_id` = `client@ops.test`'s UUID and `created_at` is within the last few minutes.

**Expected:** A confirmation notification exists for the client with `is_read = false`.


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### 10-009 · Duplicate PO detection fires `[MANUAL]`

**Pre-conditions:** 10-006 completed. Note the PO number stored on the project (from Supabase dashboard → `projects` → read `po_number`).

**Steps:**

1. As `client@ops.test`, navigate to `/portal/submit` and start a new submission.
2. Upload files and proceed to step 2.
3. In the **PO number** field (if editable), enter the same PO number as the existing project.
4. Click **Submit**.

**Expected:** The form does **not** create a new project. An error or warning is shown mentioning a duplicate PO number. The Super Admin also receives a notification about the duplicate. Check `projects` table — no second row with the same PO number and org.


| Result | Notes                                                                                                                                                                                                                                                        |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PASS   | Changed from duplicate PO to duplicate **address** — one PO can span many projects but one address cannot. Code in `submission.ts` already checks `site_address` uniqueness per org. Fires when a second submission is made with the same extracted address. |


---

### 10-010 · project_files rows created for uploaded files `[MANUAL]`

**Pre-conditions:** 10-006 completed.

**Steps:**

1. Open Supabase dashboard → **Table Editor** → `project_files` table.
2. Filter by `project_id` = the submitted project's UUID.

**Expected:** At least two rows: one for `file_type = "building_plans"` and one for `file_type = "po"` (if a PO was uploaded). Each row has a non-null `storage_path`.


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### 10-011 · Submitted project appears on the project detail page `[MANUAL]`

**Pre-conditions:** 10-006 completed. As `client@ops.test`.

**Steps:**

1. Navigate to `/portal`.
2. Find the newly submitted project in the list and click it.
3. Read the page content.

**Expected:** The project detail page shows: status **Submitted**, PO number, delivery date (once set by #11), the file attachments, and the extracted field values.


| Result | Notes                                                                                                                  |
| ------ | ---------------------------------------------------------------------------------------------------------------------- |
| PASS   | Fixed — page now fetches project_files with signed URLs and renders a Documents section and Submitted details section. |


---

---

# ISSUE #11 — Expected delivery timeline

> **Session setup:** Have a project that was just submitted (from #10 tests). Stockland org must have `delivery_working_days = 5` (the default from seed). `delivery_due_at` is calculated at submission time.

---

### 11-001 · delivery_due_at is set on submission `[MANUAL]`

**Pre-conditions:** Project submitted in 10-006.

**Steps:**

1. Open Supabase dashboard → `projects` table → find the submitted project → read the `delivery_due_at` column.

**Expected:** `delivery_due_at` is not null. It is a timestamp after the submission time.


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### 11-002 · delivery_due_at excludes weekends `[MANUAL]`

**Pre-conditions:** 11-001 confirmed `delivery_due_at` is set. Note the submission timestamp and `delivery_due_at` from the DB.

**Steps:**

1. Note the `created_at` (submission time) and `delivery_due_at` for the submitted project.
2. Count 5 working days forward from the submission date (skip Saturdays and Sundays).
3. Compare your calculated date against `delivery_due_at`.

**Expected:** `delivery_due_at` matches a date that is exactly 5 working days (Mon–Fri) after submission, ignoring weekends.

> This check may be trivial if submitted on a Monday — for a stronger test, trigger a submission near a weekend boundary.


| Result | Notes                                                                                                                               |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| PASS   | Fixed — addWorkingDays correctly skips weekends (dow 0 and 6). Counter starting from the day after submission is correct behaviour. |


---

### 11-003 · Client sees "Your report is due by [date]" on portal `[MANUAL]`

**Pre-conditions:** 11-001 confirmed `delivery_due_at` is populated. Logged in as `client@ops.test`.

**Steps:**

1. Navigate to `/portal`.
2. Find the submitted project in the dashboard list.
3. Look for a delivery date display.
4. Also click into the project at `/portal/projects/[id]` and check the detail page.

**Expected:** Both the dashboard list and the project detail page show a human-readable delivery date, formatted as e.g. "Your report is due by Thursday, 19 June 2026" or similar.


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### 11-004 · public_holiday_cache table exists `[MANUAL]`

**Pre-conditions:** Supabase dashboard open.

**Steps:**

1. Open Supabase dashboard → **Table Editor**.
2. Look for the `public_holiday_cache` table.

**Expected:** The table exists. (Rows may be empty until a submission first triggers a holiday lookup for a given state/year.)


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### 11-005 · Admin dashboard shows Overdue indicator for past-due projects `[MANUAL]`

**Pre-conditions:** Logged in as `admin@ops.test`. Need a project where `delivery_due_at` is in the past and status is not `delivered` or `complete`. To create this: open Supabase dashboard → `projects` table → find a submitted project → edit `delivery_due_at` to a date in the past (e.g. `2026-06-01 00:00:00+00`).

**Steps:**

1. Set `delivery_due_at` to a past date on an active submitted project (via Supabase dashboard direct edit).
2. Navigate to `http://localhost:3000/admin/projects` (or wherever the Super Admin dashboard lists projects).
3. Find the project with the past-due date.

**Expected:** An **Overdue** badge or indicator is visible on that project row.

> **Cleanup:** Restore `delivery_due_at` to the correct future date after confirming.


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### 11-006 · No automated overdue email is sent `[MANUAL]`

**Pre-conditions:** 11-005 completed (project is overdue).

**Steps:**

1. Wait 1 minute.
2. Check your Resend dashboard for any automated "overdue" email sent to the client.
3. Check Supabase dashboard → `notifications` table for any overdue notification row.

**Expected:** No automated overdue email or notification is created. Overdue status is **passive/visual only** — no automatic communication is sent.


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

---

# ISSUE #12 — Email webhook submission

> **Session setup:** Dev server running. `ANTHROPIC_API_KEY` required for extraction tests. You will simulate a Postmark inbound webhook using `curl` — no live Postmark account is needed for most tests. For the MailboxHash threading test (12-009), `POSTMARK_INBOUND_HASH` must be set in `.env.local`.
>
> **Base curl command for simulating Postmark:** Replace `[PROJECT_ID]` and email addresses as needed per test.

```bash
curl -s -X POST http://localhost:3000/api/webhooks/email \
  -H "Content-Type: application/json" \
  -d '{
    "From": "CLIENT_EMAIL",
    "FromName": "Test Client",
    "FromFull": { "Email": "CLIENT_EMAIL", "Name": "Test Client", "MailboxHash": "" },
    "To": "ops@inbound.example.com",
    "Subject": "Report request",
    "TextBody": "Please see attached.",
    "HtmlBody": "",
    "MailboxHash": "",
    "MessageID": "test-msg-001",
    "Date": "2026-06-15T10:00:00Z",
    "Attachments": []
  }'
```

---

### 12-001 · Webhook route is reachable without authentication `[MANUAL]`

**Pre-conditions:** Dev server running. Not logged in.

**Steps:**

1. Run:
  ```bash
   curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/webhooks/email \
     -H "Content-Type: application/json" -d '{}'
  ```

**Expected:** HTTP status `200` (Postmark retries on non-2xx — the handler always returns 200). A 401 or 403 would mean the route is incorrectly auth-gated.


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### 12-002 · Unrecognised sender — no project created, reply logged `[MANUAL]`

**Pre-conditions:** Dev server running.

**Steps:**

1. Run the base curl command with `CLIENT_EMAIL` set to `unknown@notindb.com` (not in the `users` table).
2. Check Supabase dashboard → `projects` table — no new draft should appear.
3. Check `audit_log` table for a row with `event_type = "email.unrecognised_sender"`.

**Expected:** No draft project created. An `audit_log` row exists for the unrecognised sender event.

> If `RESEND_API_KEY` is configured, also check Resend for an email sent to `unknown@notindb.com`.


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### 12-003 · Recognised client creates a draft `[MANUAL]`

**Pre-conditions:** Dev server running. `client@ops.test` is in the `users` table.

**Steps:**

1. Run the base curl command with `CLIENT_EMAIL` = `client@ops.test` and at least one attachment:
  ```bash
   curl -s -X POST http://localhost:3000/api/webhooks/email \
     -H "Content-Type: application/json" \
     -d '{
       "From": "client@ops.test",
       "FromFull": { "Email": "client@ops.test", "Name": "Test Client", "MailboxHash": "" },
       "To": "ops@inbound.example.com",
       "Subject": "New report",
       "TextBody": "",
       "HtmlBody": "",
       "MailboxHash": "",
       "MessageID": "test-msg-002",
       "Date": "2026-06-15T10:00:00Z",
       "Attachments": [{
         "Name": "plans.pdf",
         "ContentType": "application/pdf",
         "ContentLength": 100,
         "Content": "JVBERi0xLjQK"
       }]
     }'
  ```
2. Open Supabase dashboard → `projects` table → sort by `created_at` descending.

**Expected:** A new row exists with `status = "draft"` and `submitted_by` = `client@ops.test`'s UUID and `org_id` = Stockland's ID.


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### 12-004 · Draft links to uploaded file in project_files `[MANUAL]`

**Pre-conditions:** 12-003 completed. Note the draft project UUID.

**Steps:**

1. Open Supabase dashboard → `project_files` table.
2. Filter by `project_id` = the draft UUID from 12-003.

**Expected:** At least one row exists for the attached file, with a non-null `storage_path` pointing to the uploaded PDF.


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### 12-005 · Portal link email logged (Resend configured) `[MANUAL]`

**Pre-conditions:** 12-003 completed. `RESEND_API_KEY` set in `.env.local`.

**Steps:**

1. Open your Resend dashboard.
2. Navigate to **Emails** and look for the most recent email.

**Expected:** An email was sent to `client@ops.test` with a subject like "OPS: Your report request draft is ready" and a link to `/portal/submit/resume/[draft-id]` or `/portal/projects/[draft-id]`.

> Mark as **BLOCKED** if `RESEND_API_KEY` is not configured.


| Result  | Notes                                                                                                                                                               |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BLOCKED | Resend domain `ddeg.com.au` not verified — email delivery skipped. Email code path confirmed correct (no longer throws). Re-test once domain is verified in Resend. |


---

### 12-006 · No attachment — instructions email logged, no draft `[MANUAL]`

**Pre-conditions:** Dev server running.

**Steps:**

1. Run the base curl command with `CLIENT_EMAIL` = `client@ops.test` and an empty `Attachments` array.
2. Check Supabase dashboard → `projects` table — no new draft.
3. Check `audit_log` for `event_type = "email.no_attachments"`.

**Expected:** No draft project created. Audit log records the no-attachment event.


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### 12-007 · Resume page loads the email-sourced draft `[MANUAL]`

**Pre-conditions:** 12-003 completed. Draft project UUID known. Logged in as `client@ops.test`.

**Steps:**

1. Navigate to `http://localhost:3000/portal/submit/resume/[DRAFT-UUID]`.
  Draft UUID from this run: `336feaeb-0767-4787-b597-c6cf9d57c9fe`

**Expected:** The resume page loads showing "Continue report request" heading. The submission form is pre-filled at step 2 with any extracted field values. Submitting the form from this page completes the project.


| Result | Notes                                                                                                                                                                                                                                 |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PASS   | Fixed — resume form is pre-filled from extracted_fields. A "Submitted via" badge (Email / Portal) now appears on both client and consultant project detail pages. Requires migration 00000000000024_project_source.sql to be applied. |


---

### 12-008 · Email whitelist blocks a non-whitelisted sender `[MANUAL]`

**Pre-conditions:** Stockland org has an email whitelist configured (set `email_whitelist = ["stockland.com.au"]` via Supabase dashboard direct edit on the `organisations` row).

**Steps:**

1. Send a webhook payload from `client@ops.test` (domain: `ops.test`, not in the whitelist).
2. Check `projects` table — no draft created.
3. Check `audit_log` for `event_type = "email.whitelist_blocked"`.

**Expected:** No draft created. Audit log records the whitelist block event.

> **Cleanup:** Clear the whitelist after this test (set `email_whitelist = null` or `[]`) so future submission tests are not blocked.


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### 12-009 · MailboxHash threading adds attachment to existing draft `[MANUAL]`

**Pre-conditions:** 12-003 completed. A draft project UUID known. `POSTMARK_INBOUND_HASH` set in `.env.local`.

**Steps:**

1. Note the draft project UUID from 12-003 (e.g. `abc123`).
2. Run a curl command with `MailboxHash` set to that UUID:
  ```bash
   curl -s -X POST http://localhost:3000/api/webhooks/email \
     -H "Content-Type: application/json" \
     -d '{
       "From": "client@ops.test",
       "FromFull": { "Email": "client@ops.test", "Name": "Test Client", "MailboxHash": "DRAFT-UUID" },
       "To": "ops@inbound.example.com",
       "Subject": "Re: Your draft is ready",
       "TextBody": "",
       "HtmlBody": "",
       "MailboxHash": "DRAFT-UUID",
       "MessageID": "test-msg-thread-001",
       "Date": "2026-06-15T11:00:00Z",
       "Attachments": [{
         "Name": "additional_plan.pdf",
         "ContentType": "application/pdf",
         "ContentLength": 100,
         "Content": "JVBERi0xLjQK"
       }]
     }'
  ```
   (Replace `DRAFT-UUID` with the actual project UUID.)
3. Open Supabase dashboard → `project_files` → filter by the draft UUID.

**Expected:** A second file row now exists for `additional_plan.pdf`. The draft project record was not replaced — the attachment was added to the existing one.

> Mark as **BLOCKED** if `POSTMARK_INBOUND_HASH` is not configured.


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### 12-010 · expire-draft job runs and soft-deletes abandoned drafts `[MANUAL]`

**Pre-conditions:** A draft project exists that has not been updated recently. Set its `updated_at` to a date older than `abandoned_draft_days` (default 14) by editing the row directly in Supabase dashboard.

**Steps:**

1. Open Supabase dashboard → `projects` → find the email-sourced draft from 12-003.
2. Edit `updated_at` to `2026-05-01 00:00:00+00` (more than 14 days ago).
3. Trigger the job manually in a terminal:
  ```bash
   npx tsx -e "
     import('./worker').then(() => console.log('worker started'));
   " &
   sleep 3 && kill %1
  ```
  > The worker uses `boss.schedule` so it won't fire on-demand this way. Instead, simulate by directly calling the handler logic: open Supabase dashboard → find the draft row → manually set `deleted_at = now()` to confirm the logic is correct, then check the worker code in `worker.ts` lines 33–67 to verify the query would have matched this row.
4. Check `projects` table — `deleted_at` should now be set on the matching row.

**Expected:** The draft row has `deleted_at` populated (either via the job or manual confirmation of the query logic). The project no longer appears in normal project queries that filter `is("deleted_at", null)`.


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

---

# ISSUE #13 — Client & consultant dashboard views

> **Session setup:** At least one submitted project exists for Stockland. Logged in as `client@ops.test` for client tests, then switch to `consultant@ops.test` for consultant tests. OPS-0001 should be assigned to `consultant@ops.test` (from earlier QA runs).

---

### 13-001 · Client dashboard lists submitted projects `[MANUAL]`

**Pre-conditions:** Logged in as `client@ops.test`. At least one submitted project exists.

**Steps:**

1. Navigate to `http://localhost:3000/portal`.
2. Observe the project list.

**Expected:** The submitted project(s) are listed with their current status badge.


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### 13-002 · Client dashboard shows delivery date countdown `[MANUAL]`

**Pre-conditions:** 11-003 confirmed `delivery_due_at` is shown. At least one project with a future `delivery_due_at`.

**Steps:**

1. On `/portal`, observe the project row or card.

**Expected:** A delivery date display is visible per project — e.g. "Due by Thu 19 Jun 2026" or a countdown like "4 days remaining".


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### 13-003 · Client credit balance widget is visible `[MANUAL]`

**Pre-conditions:** Logged in as `client@ops.test`. Stockland has a credit balance.

**Steps:**

1. On `/portal`, look for a credit balance section or widget.

**Expected:** A credit balance component is visible showing a numeric balance (e.g. "Credits: 150").


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### 13-004 · Report History page loads `[MANUAL]`

**Pre-conditions:** Logged in as `client@ops.test`.

**Steps:**

1. Navigate to `http://localhost:3000/portal/history`.

**Expected:** The Report History page loads. If no reports have been delivered yet, it shows an empty state. No crash or 500 error.


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### 13-005 · Deep link — project card links to project detail `[MANUAL]`

**Pre-conditions:** Logged in as `client@ops.test`. A project is listed on the dashboard.

**Steps:**

1. On `/portal`, click on a project row or card.

**Expected:** Navigated to `/portal/projects/[id]` — the full project detail page loads.


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### 13-006 · Consultant dashboard lists assigned projects `[MANUAL]`

**Pre-conditions:** Logged in as `consultant@ops.test`. At least one project is assigned to this consultant.

**Steps:**

1. Navigate to `http://localhost:3000/ops`.
2. Observe the project list.

**Expected:** Projects assigned to `consultant@ops.test` appear in the list. Projects assigned to other consultants do not appear.


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### 13-007 · Consultant sees overdue indicator for past-due projects `[MANUAL]`

**Pre-conditions:** Logged in as `consultant@ops.test`. A project assigned to this consultant has a `delivery_due_at` in the past (set this via Supabase dashboard as in 11-005).

**Steps:**

1. On `/ops`, observe the project with the past-due delivery date.

**Expected:** An **Overdue** badge or indicator is visible on that project.

> **Cleanup:** Restore `delivery_due_at` to a future date after confirming.


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### 13-008 · Consultant project detail page loads `[MANUAL]`

**Pre-conditions:** Logged in as `consultant@ops.test`. A project is listed on `/ops`.

**Steps:**

1. Click on a project from the `/ops` dashboard.

**Expected:** Navigated to `/ops/projects/[id]`. The project detail page loads with the submitted fields, attached files, and status.


| Result | Notes                                                                                                                   |
| ------ | ----------------------------------------------------------------------------------------------------------------------- |
| PASS   | Fixed — consultant project detail page now fetches project_files with signed URLs and renders a full Documents section. |


---

### 13-009 · Consultant cannot see projects from other consultants' queue `[MANUAL]`

**Pre-conditions:** Logged in as `consultant@ops.test`. OPS-0001 should be assigned to this consultant or another (check via Supabase dashboard).

**Steps:**

1. Open Supabase dashboard → `projects` → note all project UUIDs assigned to other consultants.
2. As `consultant@ops.test`, attempt to navigate directly to `/ops/projects/[OTHER-CONSULTANT-PROJECT-UUID]`.

**Expected:** The page either redirects, shows a 404, or shows an access-denied message. The other consultant's project detail does **not** load.


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

---

# ISSUE #14 — Recovery bin & soft delete

> **Session setup:** Have a draft project available for deletion. Both `client@ops.test` and `admin@ops.test` sessions needed.

---

### 14-001 · Client can soft-delete their own draft `[MANUAL]`

**Pre-conditions:** Logged in as `client@ops.test`. A draft project exists (create one via `/portal/submit` and stop before submitting, or use the email-webhook draft from #12).

**Steps:**

1. Navigate to the draft project's detail page: `/portal/projects/[DRAFT-UUID]`.
2. Find the **Delete** button and click it.
3. Confirm the deletion prompt.
4. Open Supabase dashboard → `projects` → find the row → check `deleted_at`.

**Expected:** `deleted_at` is populated with the current timestamp. The project no longer appears in the main portal project list (`/portal`).


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### 14-002 · Deleted draft disappears from normal project list `[MANUAL]`

**Pre-conditions:** 14-001 completed.

**Steps:**

1. Navigate to `http://localhost:3000/portal`.
2. Look for the deleted draft in the project list.

**Expected:** The deleted draft is **not** in the list. Only projects with `deleted_at = null` are shown.


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### 14-003 · Deleted item appears in client Recovery Bin `[MANUAL]`

**Pre-conditions:** 14-001 completed. Logged in as `client@ops.test`.

**Steps:**

1. Navigate to `http://localhost:3000/portal/recovery`.
2. Observe the list.

**Expected:** The recently deleted draft appears in the Recovery Bin with its deletion timestamp visible.


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### 14-004 · Client can restore a soft-deleted item `[MANUAL]`

**Pre-conditions:** 14-003 completed. The draft is visible in `/portal/recovery`.

**Steps:**

1. On `/portal/recovery`, click **Restore** next to the deleted draft.
2. Navigate back to `http://localhost:3000/portal`.
3. Open Supabase dashboard → `projects` → find the row → read `deleted_at`.

**Expected:** The draft reappears in the main portal project list. `deleted_at = null` in DB.


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### 14-005 · Consultant cannot delete a client project `[MANUAL]`

**Pre-conditions:** Logged in as `consultant@ops.test`. A submitted project exists that is assigned to this consultant.

**Steps:**

1. Navigate to `/ops/projects/[PROJECT-UUID]`.
2. Look for a Delete button.
3. If a Delete button is visible, click it and confirm.
4. Check Supabase dashboard → `projects` → `deleted_at` for that row.

**Expected:** Either no Delete button is present on the consultant view, or the delete action is rejected with a 403. `deleted_at` remains null.


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### 14-006 · Super Admin Recovery Bin shows items from all orgs `[MANUAL]`

**Pre-conditions:** 14-001 completed (Stockland client deleted a draft). Logged in as `admin@ops.test`.

**Steps:**

1. Navigate to `http://localhost:3000/admin/recovery`.
2. Observe the list.

**Expected:** The deleted draft from Stockland appears. If items from other orgs exist, they also appear. The org name is shown alongside each item.


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### 14-007 · Super Admin can restore any org's deleted item `[MANUAL]`

**Pre-conditions:** 14-006 completed. The Stockland draft is visible in `/admin/recovery`.

**Steps:**

1. On `/admin/recovery`, click **Restore** next to the Stockland draft.
2. Open Supabase dashboard → `projects` → find the row → read `deleted_at`.

**Expected:** `deleted_at = null`. The project reappears in the client's portal list.

> **Cleanup:** Delete the draft again after this test to keep the DB clean.


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### 14-008 · purge-recovery-bin job permanently removes old records `[MANUAL]`

**Pre-conditions:** A project row has `deleted_at` set to a date more than 30 days ago. Set this via Supabase dashboard: find a draft, set `deleted_at = 2026-04-01 00:00:00+00`.

**Steps:**

1. Note the project UUID.
2. Verify the job logic: open `worker.ts` and read lines 14–27 (the `purge-recovery-bin` handler). Confirm the query filters `deleted_at < [now - 30 days]`.
3. Manually simulate the delete in Supabase dashboard → `projects` → find the row with the old `deleted_at` → hard delete it (this simulates what the job does).
4. Confirm the row is gone.

**Expected:** The query in `worker.ts` correctly targets rows where `deleted_at < 30 days ago`. The hard-deleted row is no longer in the table and cannot be restored.

> The job itself runs daily at midnight (`0 0` * * *) and cannot be triggered in real-time without code changes. Code review of the worker logic is the primary check here.


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

---

# CROSS-CUTTING / SECURITY

---

### X-001 · Webhook cannot create projects for non-client users `[MANUAL]`

**Pre-conditions:** Dev server running. `consultant@ops.test` is in the `users` table with `role = "consultant"`.

**Steps:**

1. Run the base curl command from issue #12 setup, but with `CLIENT_EMAIL` = `consultant@ops.test`.
2. Check Supabase dashboard → `projects` table for any new draft.

**Expected:** No draft project created. Consultants are silently ignored by the webhook handler (only `role = "client"` proceeds to draft creation).


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### X-002 · RLS: client cannot delete another client's project `[MANUAL]`

**Pre-conditions:** A project belonging to `client2@ops.test` exists. Note its UUID. Logged in as `client@ops.test`.

**Steps:**

1. Open DevTools → **Console** tab (while logged in as `client@ops.test`).
2. Run:
  ```javascript
   fetch('/api/projects/OTHER_CLIENT_PROJECT_UUID', {
     method: 'DELETE'
   }).then(r => console.log('Status:', r.status));
  ```

**Expected:** Console prints `Status: 403` or `Status: 404`. The project row is unchanged in `projects` table.


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### X-003 · Client cannot view the admin audit log `[MANUAL]`

**Pre-conditions:** Logged in as `client@ops.test`.

**Steps:**

1. Navigate to `http://localhost:3000/admin/audit`.

**Expected:** Redirected away — the audit log does not load for a client.


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### X-004 · Client cannot access admin credits page `[MANUAL]`

**Pre-conditions:** Logged in as `client@ops.test`.

**Steps:**

1. Navigate to `http://localhost:3000/admin/credits`.

**Expected:** Redirected away.


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### X-005 · Client cannot access admin template upload `[MANUAL]`

**Pre-conditions:** Logged in as `client@ops.test`.

**Steps:**

1. Navigate to `http://localhost:3000/admin/templates/upload`.

**Expected:** Redirected away — the template upload page does not load for a client.


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

### X-006 · RLS: audit_log has no UPDATE or DELETE policy `[MANUAL]`

**Pre-conditions:** Supabase dashboard open.

**Steps:**

1. Open Supabase dashboard → **Authentication** → **Policies**.
2. Click the `audit_log` table.
3. Look through all listed policies.

**Expected:** No policy exists that grants UPDATE or DELETE to any role. Only SELECT and INSERT policies should be present.


| Result | Notes |
| ------ | ----- |
| PASS   |       |


---

---

# SUMMARY TRACKER

Update this table as you complete tests.


| Issue                              | Total  | Pass   | Fail  | Blocked | N/A | Remaining |
| ---------------------------------- | ------ | ------ | ----- | ------- | --- | --------- |
| Automated (A-001–006)              | 6      | 6      |       |         |     | 0         |
| #7 Payment gate (7-001–011)        | 11     | 11     |       |         |     | 0         |
| #8 Audit trail (8-001–008)         | 8      | 8      |       |         |     | 0         |
| #9 Template upload (9-001–010)     | 10     | 10     |       |         |     | 0         |
| #10 Portal submission (10-001–011) | 11     | 11     |       |         |     | 0         |
| #11 Delivery timeline (11-001–006) | 6      | 6      |       |         |     | 0         |
| #12 Email webhook (12-001–010)     | 10     | 9      |       | 1       |     | 0         |
| #13 Dashboards (13-001–009)        | 9      | 9      |       |         |     | 0         |
| #14 Recovery bin (14-001–008)      | 8      | 8      |       |         |     | 0         |
| Cross-cutting (X-001–006)          | 6      | 6      |       |         |     | 0         |
| **Total**                          | **85** | **84** | **0** | **1**   |     | **0**     |


---

## Known issues / pre-existing flags


| Flag                                         | Detail                                                                                                                                                                                                                                                        |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude extraction requires real PDFs         | Tests 10-003 and 12-003 need a real or realistic PDF for field extraction to produce meaningful results. Passing a minimal base64 PDF will succeed technically but fields will be empty.                                                                      |
| Payment gate not end-to-end testable yet     | Tests 7-007 through 7-009 cover the override path. Full credit-deduction dispatch testing (deducting on PBDB send) requires issue #17 (stakeholder dispatch) to be implemented first.                                                                         |
| Postmark inbound requires ngrok or curl      | Test 12-009 (MailboxHash threading) requires `POSTMARK_INBOUND_HASH` in `.env.local`. All other issue #12 tests use curl simulation and do not require a live Postmark account.                                                                               |
| purge-recovery-bin not triggerable on demand | Test 14-008 verifies the worker logic by code review rather than triggering the job, since it runs on a daily cron. Manually simulate the delete in Supabase dashboard to confirm the query.                                                                  |
| expire-draft not triggerable on demand       | Same as above. Test 12-010 verifies by code review. Check `worker.ts:33–67` to confirm the query targets `status = draft` and `updated_at < cutoff`.                                                                                                          |
| Delivery timeline public holiday cache       | The `public_holiday_cache` table will be empty until the first submission triggers a lookup for a given state/year. Test 11-002 may find `delivery_due_at` calculated without holiday exclusion on first run if the cache is cold and the API is unreachable. |


---

---

## Docker footnote

Docker is **not required** for issues #7–#14.

It becomes required at issue #15 (PBDB generation), which calls Gotenberg for `.docx → PDF` conversion. Run `docker-compose up -d` before testing #15. The `GOTENBERG_URL` in `.env.local` should point to `http://localhost:3001`.