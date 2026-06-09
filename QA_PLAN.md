# OPS QA Plan — Issues #2–6

**Generated:** 2026-06-09  
**Covers:** Issues #2 (Infrastructure), #3 (Auth), #4 (Org & User Management), #5 (Notifications), #6 (Consultant Assignment)

---

## How to use this document

Every test is labelled `**[AUTOMATED]`** or `**[MANUAL]**`.

- `**[AUTOMATED]**` — run the listed command in terminal; check the output. No browser needed.
- `**[MANUAL]**` — requires browser interaction. Step-by-step instructions are provided.

Fill in the **Result** field for each test with one of:

- `PASS` — works as expected
- `FAIL` — does not work; add detail in Notes
- `BLOCKED` — cannot test (missing env var, missing setup); note why
- `N/A` — not applicable in this environment

---

## Setup

**What you need to run this QA plan:**

1. `.env.local` with your cloud Supabase credentials (see 2-001)
2. `npm run dev` running in terminal
3. Your Supabase cloud dashboard open at `https://supabase.com/dashboard` — used throughout to verify database changes

No Docker required for issues #2–#6. See the [Docker footnote](#docker-footnote) at the bottom of this document for when Docker becomes relevant.

---

## Test accounts (created by running `npx tsx supabase/seed.ts`)

> **Before testing:** Make sure the seed script has been run against your cloud Supabase instance. See 2-004 for how.


| Role        | Email                                               | Password       | Extra                         |
| ----------- | --------------------------------------------------- | -------------- | ----------------------------- |
| Super Admin | [admin@ops.test](mailto:admin@ops.test)             | Ops@TestPass1! |                               |
| Consultant  | [consultant@ops.test](mailto:consultant@ops.test)   | Ops@TestPass1! | Available — Test Consultant   |
| Consultant  | [consultant2@ops.test](mailto:consultant2@ops.test) | Ops@TestPass1! | Available — Sarah Chen        |
| Consultant  | [consultant3@ops.test](mailto:consultant3@ops.test) | Ops@TestPass1! | On leave — Marcus Webb        |
| Consultant  | [consultant4@ops.test](mailto:consultant4@ops.test) | Ops@TestPass1! | At capacity — Priya Nair      |
| Consultant  | [consultant5@ops.test](mailto:consultant5@ops.test) | Ops@TestPass1! | Available — James O'Brien     |
| Client      | [client@ops.test](mailto:client@ops.test)           | Ops@TestPass1! | Stockland org                 |
| Client      | [client2@ops.test](mailto:client2@ops.test)         | Ops@TestPass1! | Stockland org — Emma Davis    |
| Client      | [client3@ops.test](mailto:client3@ops.test)         | Ops@TestPass1! | Stockland org — Ryan Thompson |


**Dummy project:** `OPS-0001` (status: submitted, unassigned) — used in #6 tests.

> ⚠️ **Important — 2FA and seed accounts:** Seeded accounts skip the 2FA gate. They were created with `profile_complete: true` set directly in auth metadata, bypassing the normal invite flow. To test the full invite → profile → 2FA enrollment flow (tests 3-001 to 3-012) you must invite a **brand-new email address you have access to** via the Super Admin UI. Supabase cloud sends real emails — you will need to check that inbox.

---

---

# AUTOMATED CHECKS

These tests run in terminal. No browser required. Results from the initial run on 2026-06-09 are pre-filled. Re-run any time with the listed command and update the Re-run Result column.

---

### A-001 · TypeScript — zero compile errors `[AUTOMATED]`

**Command:**

```bash
npm run type-check
```

**How to interpret:** No output = PASS. Any line starting with a file path = FAIL (lists the error).


| Last Result (2026-06-09) | Re-run Result | Notes |
| ------------------------ | ------------- | ----- |
| PASS                     |               |       |


---

### A-002 · ESLint — zero errors `[AUTOMATED]`

**Command:**

```bash
npm run lint
```

**How to interpret:** "0 errors" = PASS. Warnings are acceptable (one pre-existing warning: unused `Resend` import in `lib/email/sender.ts` — non-blocking). Any error = FAIL.


| Last Result (2026-06-09)       | Re-run Result | Notes |
| ------------------------------ | ------------- | ----- |
| PASS (1 warning, non-blocking) |               |       |


---

### A-003 · All 6 database migrations present `[AUTOMATED]`

**Command:**

```bash
ls supabase/migrations/ | wc -l
```

**How to interpret:** Output must be `6`.


| Last Result (2026-06-09) | Re-run Result | Notes |
| ------------------------ | ------------- | ----- |
| PASS (6)                 |               |       |


---

### A-004 · All 7 email templates present `[AUTOMATED]`

**Command:**

```bash
ls lib/email/templates/
```

**How to interpret:** Output must list all 7 files: `AcknowledgementEmail.tsx`, `ApprovalRequestEmail.tsx`, `ConsultantAssignedEmail.tsx`, `CreditDeductionEmail.tsx`, `LowCreditEmail.tsx`, `ModificationsRequestedEmail.tsx`, `PBDRDeliveryEmail.tsx`.


| Last Result (2026-06-09) | Re-run Result | Notes |
| ------------------------ | ------------- | ----- |
| PASS (7 templates)       |               |       |


---

### A-005 · CI workflow file exists and is correctly configured `[AUTOMATED]`

**Command:**

```bash
cat .github/workflows/ci.yml
```

**How to interpret:** Output must contain `npm run type-check` and `npm run lint`. Both steps present = PASS.


| Last Result (2026-06-09) | Re-run Result | Notes |
| ------------------------ | ------------- | ----- |
| PASS                     |               |       |


---

---

# ISSUE #2 — Project scaffold & infrastructure

---

### 2-001 · Dev server starts `[MANUAL]`

**Pre-conditions:** Node 20+ installed. `.env.local` configured with your cloud Supabase credentials.

**Steps:**

1. If you don't have a `.env.local` yet, copy the example file:
  ```bash
   cp .env.example .env.local
  ```
2. Open `.env.local` and fill in these values from your Supabase cloud dashboard (go to `https://supabase.com/dashboard` → your project → **Settings** → **API**):
  - `NEXT_PUBLIC_SUPABASE_URL` = your project URL (e.g. `https://xxxx.supabase.co`)
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = the `anon` / `public` key
  - `SUPABASE_SERVICE_ROLE_KEY` = the `service_role` key (keep this secret)
  - `NEXT_PUBLIC_APP_URL` = `http://localhost:3000`
3. Run:
  ```bash
   npm run dev
  ```
4. Open `http://localhost:3000` in browser.

**Expected:** The login page loads. No crash or error in the terminal.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 2-002 · Supabase tables are visible in the cloud dashboard `[MANUAL]`

**Pre-conditions:** 2-004 (seed) has been run so tables are populated.

**Steps:**

1. Open `https://supabase.com/dashboard`.
2. Click into your OPS project.
3. In the left sidebar, click **Table Editor**.
4. Confirm these tables are listed: `organisations`, `users`, `notifications`, `projects`.
5. Click each table to confirm it opens without error.

**Expected:** All 4 tables are present and contain rows (from seed data).


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 2-003 · Gotenberg health check `[N/A — Docker required]`

Docker is not in use for this QA run. Mark as N/A. See the [Docker footnote](#docker-footnote) at the bottom for when this becomes relevant.


| Result | Notes                                         |
| ------ | --------------------------------------------- |
| N/A    | Requires Docker — not needed for issues #2–#6 |


---

### 2-004 · Seed script runs successfully `[MANUAL]`

**Pre-conditions:** 2-001 completed (`.env.local` has Supabase keys).

**Steps:**

1. Open terminal at project root.
2. Run:
  ```bash
   npx tsx supabase/seed.ts
  ```
3. Watch the console output. It prints one line per user as it creates them.

**Expected:** Final lines say:

```
Seed complete. Password for all accounts: Ops@TestPass1!
Dummy project: OPS-0001 (status: submitted, unassigned) → /admin/projects
```


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 2-005 · `railway.toml` defines 3 services `[MANUAL]`

**Pre-conditions:** None.

**Steps:**

1. Open `railway.toml` in your editor.
2. Check for three service blocks: `[services.ops-web]`, `[services.ops-worker]`, `[services.ops-pdf]`.
3. Verify `ops-web` has `startCommand = "npm start"`.
4. Verify `ops-worker` has `startCommand = "npm run worker"`.
5. Verify `ops-pdf` references the Gotenberg image.

**Expected:** All three services present with correct commands.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 2-006 · `.env.example` documents all required variables `[MANUAL]`

**Pre-conditions:** None.

**Steps:**

1. Open `.env.example` in your editor.
2. Confirm these 10 variable names are present (values can be blank):
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `NEXT_PUBLIC_APP_URL`
  - `DATABASE_URL`
  - `RESEND_API_KEY`
  - `POSTMARK_SERVER_TOKEN`
  - `POSTMARK_INBOUND_HASH`
  - `GOTENBERG_URL`
  - `ANTHROPIC_API_KEY`

**Expected:** All 10 variables documented.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 2-007 · GitHub Actions CI passes on push `[MANUAL]`

**Pre-conditions:** GitHub remote is connected (`git remote -v` should show an origin URL). You have push access.

**Steps:**

1. Make a trivial change (e.g. add a blank line to the bottom of `README.md` or any non-breaking file).
2. Commit and push:
  ```bash
   git add -A && git commit -m "ci smoke test" && git push
  ```
3. Open your GitHub repo in the browser.
4. Click the **Actions** tab.
5. Click the most recent workflow run ("CI").
6. Expand the "Type-check" and "Lint" steps.

**Expected:** Both steps show a green checkmark. Total run time should be under 2 minutes.


| Result | Notes |
| ------ | ----- |
|        |       |


---

---

# ISSUE #3 — Auth: invite, 2FA, sessions, role middleware

> **Session setup for this section:** The dev server must be running (`npm run dev`). Tests 3-001 to 3-012 require inviting a brand-new email address you have inbox access to — Supabase cloud sends **real emails**. Use your own email address or a disposable inbox (e.g. [temp-mail.io](https://temp-mail.io)).

---

### 3-001 · Super Admin sends an invite `[MANUAL]`

**Pre-conditions:** Logged in as `admin@ops.test`. Seed has been run (2-004).

**Steps:**

1. Navigate to `http://localhost:3000/admin/users/invite`.
2. In the **Email** field, enter a real email address you can check (e.g. your own email or a temp inbox).
3. In the **Role** field, select: `client`
4. In the **Organisation** field, select: `Stockland`
5. Click **Send invite**.
6. After the redirect, open your Supabase dashboard → **Table Editor** → `users` table.
7. Check for a new row with that email and `invited_at` set to a timestamp.

**Expected:** Redirected to `/admin/users/[new-user-id]`. New row exists in the `users` table with `invited_at` populated.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 3-002 · Invite email is received `[MANUAL]`

**Pre-conditions:** 3-001 completed.

**Steps:**

1. Check the inbox for the email address you used in 3-001.
2. Look for an email from Supabase / OPS with a subject like "You have been invited".
3. Open the email.
4. Look for a link in the email body — it should contain `/auth/confirm`.

> **Not seeing the email?** Check your spam folder. You can also verify it was sent via your Supabase dashboard → **Authentication** → **Users** → find the user → confirm `invited_at` is set.

**Expected:** Email arrived with a magic-link URL pointing to your local app (`http://localhost:3000/auth/confirm?...`).


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 3-003 · Invite link loads the complete-profile screen `[MANUAL]`

**Pre-conditions:** 3-002 completed. Invite email is in your inbox.

**Steps:**

1. Click the invite link in the email.
2. Observe the page that loads.

> **Note:** The link redirects to `http://localhost:3000/auth/confirm` — your dev server must be running for this to work.

**Expected:** Redirected to `/complete-profile`. The page shows a form with these fields: First name, Last name, Phone, Company role, State/territory (dropdown), Password, Confirm password.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 3-004 · Profile completion — required fields enforced `[MANUAL]`

**Pre-conditions:** On the `/complete-profile` page.

**Steps:**

1. Leave the **First name** field empty.
2. Fill in all other fields correctly (any values, any valid password).
3. Click Submit.

**Expected:** An inline validation error appears under First name. The page does **not** redirect.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 3-005 · Password policy — minimum 12 characters `[MANUAL]`

**Pre-conditions:** On `/complete-profile`. Fill all non-password fields with valid data first.

**Steps:**

1. In the **Password** field, enter: `Short1!` (7 characters)
2. In **Confirm password**, enter the same.
3. Click Submit.

**Expected:** Error shown: "Must be at least 12 characters"


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 3-006 · Password policy — uppercase letter required `[MANUAL]`

**Pre-conditions:** On `/complete-profile`. All non-password fields filled.

**Steps:**

1. In **Password**, enter: `alllowercase1!` (14 chars, no uppercase)
2. In **Confirm password**, enter the same.
3. Click Submit.

**Expected:** Error shown: "Must contain an uppercase letter"


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 3-007 · Password policy — number required `[MANUAL]`

**Pre-conditions:** On `/complete-profile`. All non-password fields filled.

**Steps:**

1. In **Password**, enter: `NoNumberHere!X` (14 chars, no digit)
2. In **Confirm password**, enter the same.
3. Click Submit.

**Expected:** Error shown: "Must contain a number"


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 3-008 · Password policy — special character required `[MANUAL]`

**Pre-conditions:** On `/complete-profile`. All non-password fields filled.

**Steps:**

1. In **Password**, enter: `NoSpecialChar12` (15 chars, no special character)
2. In **Confirm password**, enter the same.
3. Click Submit.

**Expected:** Error shown: "Must contain a special character"


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 3-009 · Successful profile completion `[MANUAL]`

**Pre-conditions:** On `/complete-profile`. Have an authenticator app installed on your phone (Google Authenticator, Authy, or similar) — you will need it in 3-010 to 3-012.

**Steps:**

1. Fill in all fields:
  - First name: `Test`
  - Last name: `Invitee`
  - Phone: `0400000000`
  - Company role: `Engineer`
  - State/territory: select `NSW`
  - Password: `ComplexPass1!@`
  - Confirm password: `ComplexPass1!@`
2. Click Submit.

**Expected:** Profile saved. Redirected to `/setup-2fa`.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 3-010 · 2FA setup — QR code is displayed `[MANUAL]`

**Pre-conditions:** Arrived at `/setup-2fa` after 3-009.

**Steps:**

1. Observe the page.

**Expected:** A QR code image is visible on screen. Below it, there is an input field for a 6-digit code and a Submit/Confirm button.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 3-011 · 2FA enrollment — wrong code is rejected `[MANUAL]`

**Pre-conditions:** On `/setup-2fa`.

**Steps:**

1. In the 6-digit code input, type: `000000`
2. Click Confirm.

**Expected:** Error message shown: "Invalid code. Scan the QR code again and retry."


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 3-012 · 2FA enrollment — correct code accepted `[MANUAL]`

**Pre-conditions:** On `/setup-2fa`. Authenticator app on phone.

**Steps:**

1. Open your authenticator app on your phone.
2. Tap **+** or **Add account** → **Scan QR code**.
3. Point your phone camera at the QR code on screen — it will be added to your app.
4. Your app will show a 6-digit code that rotates every 30 seconds.
5. Type the current 6-digit code into the input field on screen.
6. Click Confirm before the code expires.
7. After redirect, open Supabase dashboard → **Table Editor** → `users` table → find the invited user → check `totp_enabled` column.

**Expected:** Redirected to `/` (client portal). `totp_enabled = true` in the `users` table for this user.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 3-013 · Login — invalid credentials rejected `[MANUAL]`

**Pre-conditions:** Dev server running. Navigate to `http://localhost:3000/login`.

**Steps:**

1. In **Email**, enter: `admin@ops.test`
2. In **Password**, enter: `wrongpassword123`
3. Click Sign in.

**Expected:** Error message displayed on the form: "Invalid email or password". Not redirected.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 3-014 · Login redirects to 2FA screen for enrolled user `[MANUAL]`

**Pre-conditions:** 3-012 completed (the invited user has TOTP enrolled). Currently logged out.

**Steps:**

1. Navigate to `http://localhost:3000/login`.
2. In **Email**, enter the email address you invited in 3-001.
3. In **Password**, enter: `ComplexPass1!@` (the password you set in 3-009).
4. Click Sign in.

**Expected:** Redirected to `/verify-2fa`.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 3-015 · 2FA verification — wrong code rejected `[MANUAL]`

**Pre-conditions:** On `/verify-2fa` (arrived after 3-014).

**Steps:**

1. In the code field, enter: `000000`
2. Click Verify.

**Expected:** Error message: "Invalid code. Please try again."


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 3-016 · 2FA verification — correct code accepted `[MANUAL]`

**Pre-conditions:** On `/verify-2fa`. Authenticator app open on your phone.

**Steps:**

1. Open your authenticator app and find the entry for the invited user.
2. Read the current 6-digit code.
3. Enter the code into the input field.
4. Click Verify.

**Expected:** Redirected to `/` (or the `next` destination). You are now logged in as the invited client user.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 3-017 · Deep link restore — valid session navigates directly `[MANUAL]`

**Pre-conditions:** Logged in as `admin@ops.test`.

**Steps:**

1. While already logged in, click the browser address bar.
2. Type: `http://localhost:3000/admin/projects`
3. Press Enter.

**Expected:** The `/admin/projects` page loads directly — no redirect to login occurs.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 3-018 · Deep link restore — after login returns to destination `[MANUAL]`

**Pre-conditions:** Currently logged out.

**Steps:**

1. Make sure you are signed out.
2. Type this URL directly in the address bar: `http://localhost:3000/admin/projects`
3. You will be redirected to `/login`. Check that the URL bar now shows something like `/login?next=%2Fadmin%2Fprojects`.
4. Log in as `admin@ops.test` / `Ops@TestPass1!`.

**Expected:** After successful login, you are redirected to `/admin/projects` — not to `/admin` or `/`.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 3-019 · Account lockout after 15 failed attempts `[MANUAL]`

> ⚠️ **Use `client2@ops.test` for this test** — do not use [admin@ops.test](mailto:admin@ops.test) or you will lock yourself out.

**Pre-conditions:** Logged out. Dev server running.

**Steps:**

1. Navigate to `http://localhost:3000/login`.
2. Enter email: `client2@ops.test`
3. Enter any wrong password (e.g. `badpassword`)
4. Click Sign in.
5. Repeat steps 2–4 exactly **15 times** (the error will say "Invalid email or password" for the first 14 attempts).
6. On the **15th** attempt, read the error message carefully.

> **Tip to go faster:** After each failed attempt the form clears. Keep the email pre-filled by using browser autofill, and re-enter the wrong password each time. Takes about 2 minutes.

**Expected:** On the 15th failed login: "Account locked after repeated failed attempts. Contact your administrator."


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 3-020 · Locked account — correct password is also blocked `[MANUAL]`

**Pre-conditions:** 3-019 completed. `client2@ops.test` is now locked.

**Steps:**

1. On the login page, enter: `client2@ops.test`
2. Enter the **correct** password: `Ops@TestPass1!`
3. Click Sign in.

**Expected:** Error shown: "Your account is locked. Contact your administrator to regain access."


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 3-021 · Super Admin unlocks a locked account `[MANUAL]`

**Pre-conditions:** 3-019 and 3-020 completed. `client2@ops.test` is locked.

**Steps:**

1. Log in as `admin@ops.test` / `Ops@TestPass1!`.
2. Navigate to `http://localhost:3000/admin/users`.
3. Find **Emma Davis** (`client2@ops.test`) and click her name.
4. On the user detail page, find the **Unlock account** button and click it.
5. Open Supabase dashboard → **Table Editor** → `users` table → find `client2@ops.test` → check `is_locked = false` and `failed_login_count = 0`.
6. Log out and try to log in as `client2@ops.test` / `Ops@TestPass1!`.

**Expected:** Account unlocks. `is_locked = false` and `failed_login_count = 0` in DB. User can log in successfully again.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 3-022 · Client cannot access the admin portal `[MANUAL]`

**Pre-conditions:** Logged in as `client@ops.test` / `Ops@TestPass1!`.

**Steps:**

1. Log in as `client@ops.test`.
2. In the address bar, navigate to: `http://localhost:3000/admin`

**Expected:** Redirected away from `/admin` — you end up at `/portal`, `/`, or `/login`, but **not** the admin dashboard.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 3-023 · Client cannot access the consultant portal `[MANUAL]`

**Pre-conditions:** Logged in as `client@ops.test`.

**Steps:**

1. Navigate to: `http://localhost:3000/ops`

**Expected:** Redirected away — consultant portal does not load.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 3-024 · Consultant cannot access the admin portal `[MANUAL]`

**Pre-conditions:** Logged in as `consultant@ops.test` / `Ops@TestPass1!`.

**Steps:**

1. Log in as `consultant@ops.test`.
2. Navigate to: `http://localhost:3000/admin`

**Expected:** Redirected away — admin dashboard does not load.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 3-025 · Consultant cannot access the client portal `[MANUAL]`

**Pre-conditions:** Logged in as `consultant@ops.test`.

**Steps:**

1. Navigate to: `http://localhost:3000/portal`

**Expected:** Redirected away — client portal does not load.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 3-026 · Super Admin can access the admin portal `[MANUAL]`

**Pre-conditions:** Logged in as `admin@ops.test`.

**Steps:**

1. Navigate to: `http://localhost:3000/admin`

**Expected:** Admin dashboard loads successfully.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 3-027 · Unauthenticated user is redirected to login `[MANUAL]`

**Pre-conditions:** Not logged in (clear cookies or use a private/incognito window).

**Steps:**

1. Open a private/incognito browser window.
2. Navigate to: `http://localhost:3000/admin`

**Expected:** Redirected to `/login`. The admin dashboard does not load.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 3-028 · Client session — 8-hour cookie is set `[MANUAL]`

**Pre-conditions:** Dev server running.

**Steps:**

1. Log in as `client@ops.test` / `Ops@TestPass1!`.
2. Open browser DevTools (**F12** on Windows, **Cmd+Option+I** on Mac).
3. Go to the **Application** tab (Chrome) or **Storage** tab (Firefox).
4. Expand **Cookies** → click `http://localhost:3000`.
5. Find the cookie named `ops-session-expires`.
6. Read the **Expires / Max-Age** column and compare to the current time — difference should be ~8 hours.

**Expected:** Cookie expiry is approximately 8 hours from the time you logged in.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 3-029 · Consultant session — 4-hour cookie is set `[MANUAL]`

**Pre-conditions:** Dev server running.

**Steps:**

1. Log out and log in as `consultant@ops.test` / `Ops@TestPass1!`.
2. Follow the same DevTools cookie inspection steps as 3-028.
3. Find `ops-session-expires` and check the expiry.

**Expected:** Cookie expiry is approximately 4 hours from login time.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 3-030 · Admin session — 4-hour cookie is set `[MANUAL]`

**Pre-conditions:** Dev server running.

**Steps:**

1. Log out and log in as `admin@ops.test` / `Ops@TestPass1!`.
2. Follow the same DevTools cookie inspection steps as 3-028.
3. Find `ops-session-expires` and check the expiry.

**Expected:** Cookie expiry is approximately 4 hours from login time.


| Result | Notes |
| ------ | ----- |
|        |       |


---

---

# ISSUE #4 — Organisation & user management

> **Session setup:** Log in as `admin@ops.test` before running these tests. Keep the Supabase dashboard open to verify database changes (dashboard → Table Editor).

---

### 4-001 · Create a new organisation `[MANUAL]`

**Pre-conditions:** Logged in as `admin@ops.test`.

**Steps:**

1. Navigate to `http://localhost:3000/admin/organisations/new`.
2. Fill in the form:
  - **Name:** `Test Org QA`
  - **Payment method:** `upfront`
  - **Delivery working days:** `5`
  - **State/territory:** `NSW`
  - **Abandoned draft days:** `14`
  - **Credit limit:** `0`
3. Click **Create**.
4. After redirect, open Supabase dashboard → **Table Editor** → `organisations` table and confirm the new row.

**Expected:** Redirected to the new org's detail page. Row exists in DB.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 4-002 · Slug is auto-generated from the org name `[MANUAL]`

**Pre-conditions:** 4-001 completed (or create another new org for this test).

**Steps:**

1. Create a new org named: `Test Org ABC` (follow 4-001 steps).
2. After redirect, open Supabase dashboard → **Table Editor** → `organisations` table.
3. Find the "Test Org ABC" row and read the `slug` column.

**Expected:** `slug = "test-org-abc"` (lowercase, spaces replaced by hyphens).


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 4-003 · Delivery working days — minimum validation `[MANUAL]`

**Pre-conditions:** On `/admin/organisations/new`. Fill all other fields correctly.

**Steps:**

1. In **Delivery working days**, enter: `0`
2. Click submit.

**Expected:** Error displayed: "Must be at least 1 day". Form does not submit.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 4-004 · Delivery working days — maximum validation `[MANUAL]`

**Pre-conditions:** On `/admin/organisations/new`. Fill all other fields correctly.

**Steps:**

1. In **Delivery working days**, enter: `31`
2. Click submit.

**Expected:** Error displayed: "Must be 30 days or fewer".


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 4-005 · Edit an existing organisation `[MANUAL]`

**Pre-conditions:** Logged in as `admin@ops.test`. Seed has been run (Stockland exists).

**Steps:**

1. Navigate to `http://localhost:3000/admin/organisations`.
2. Click on **Stockland**.
3. Change the **Delivery working days** from `5` to `7`.
4. Click **Save**.
5. Reload the page and check the field value.

**Expected:** A "Saved" confirmation or success indicator appears. After reload, the field shows `7`.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 4-006 · Email whitelist is parsed and stored as an array `[MANUAL]`

**Pre-conditions:** On Stockland's edit page.

**Steps:**

1. Open Stockland's edit page (from `/admin/organisations`, click Stockland).
2. Find the **Email whitelist** field.
3. Enter: `example.com, test.org`
4. Click Save.
5. Open Supabase dashboard → **Table Editor** → `organisations` → find Stockland → read the `email_whitelist` column.

**Expected:** DB stores: `["example.com", "test.org"]` (an array, not a raw string).


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 4-007 · Freeze a deferred account `[MANUAL]`

**Pre-conditions:** You need a deferred-type org — create one first (follow 4-001 but select `deferred` as payment method).

**Steps:**

1. Navigate to the deferred org's detail page.
2. Find the **Freeze account** button and click it.
3. Open Supabase dashboard → **Table Editor** → `organisations` → find this org → read `is_frozen`.
4. Return to the org detail page and check the button label.

**Expected:** `is_frozen = true` in DB. Button label has changed to **Unfreeze account**.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 4-008 · Unfreeze a frozen account `[MANUAL]`

**Pre-conditions:** 4-007 completed. A frozen deferred org exists.

**Steps:**

1. On the frozen org's detail page, click **Unfreeze account**.
2. Check Supabase dashboard → `is_frozen` column for this org.

**Expected:** `is_frozen = false` in DB. Button label reverts to **Freeze account**.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 4-009 · Credit balance is visible on a credit-deduction org `[MANUAL]`

**Pre-conditions:** Logged in as `admin@ops.test`. Stockland is a credit-deduction org with balance 100 (from seed).

**Steps:**

1. Navigate to `/admin/organisations`.
2. Click **Stockland**.
3. Look on the detail page for a credit balance display.

**Expected:** Credit balance (100) is visible on the page.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 4-010 · Invite a client user with a valid org `[MANUAL]`

**Pre-conditions:** Logged in as `admin@ops.test`.

**Steps:**

1. Navigate to `http://localhost:3000/admin/users/invite`.
2. **Email:** enter a real email address you can check
3. **Role:** `client`
4. **Organisation:** `Stockland`
5. Click **Send invite**.
6. Check Supabase dashboard → `users` table for the new row.

**Expected:** Redirected to the new user's detail page. Row exists in `users` table with `org_id` set to Stockland's ID.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 4-011 · Invite client user — missing org is blocked `[MANUAL]`

**Pre-conditions:** On `/admin/users/invite`.

**Steps:**

1. **Email:** any email address
2. **Role:** `client`
3. Leave **Organisation** blank / unselected.
4. Click **Send invite**.

**Expected:** Error displayed: "Organisation required for client users". Form does not submit.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 4-012 · Invite a consultant user (no org needed) `[MANUAL]`

**Pre-conditions:** On `/admin/users/invite`.

**Steps:**

1. **Email:** any email address
2. **Role:** `consultant`
3. Leave Organisation blank.
4. Click **Send invite**.
5. Check Supabase dashboard → `users` table for the new row.

**Expected:** Redirected to user detail page. Row in `users` table with `role = consultant` and `org_id = null`.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 4-013 · Multiple users can exist under one org `[MANUAL]`

**Pre-conditions:** 4-010 completed. Stockland already has seeded client users.

**Steps:**

1. Invite a second client to Stockland (repeat 4-010 with a different email).
2. Open Supabase dashboard → **Table Editor** → `users` table.
3. Look for multiple rows with the same `org_id` (Stockland's ID).

**Expected:** Multiple rows for Stockland — at least the 3 seeded clients plus your newly invited ones.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 4-014 · Super Admin can edit a user's profile `[MANUAL]`

**Pre-conditions:** Logged in as `admin@ops.test`.

**Steps:**

1. Navigate to `/admin/users`.
2. Click on **Test Consultant** (`consultant@ops.test`).
3. In the **First name** field, change it to `UpdatedFirst`.
4. Click **Save**.
5. Check Supabase dashboard → `users` table → `consultant@ops.test` row → `first_name` column.

**Expected:** "Saved" confirmation displayed. `first_name = "UpdatedFirst"` in the database.

> **Cleanup:** Change the first name back to `Test` after confirming.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 4-015 · State/territory server-side validation `[MANUAL]`

**Pre-conditions:** On any user edit page. Browser DevTools open.

**Steps:**

1. Open the edit page for any user (e.g. `consultant@ops.test`).
2. Press **F12** to open DevTools → go to the **Console** tab.
3. Run this JavaScript to override the select element's value:
  ```javascript
   document.querySelector('select[name="state_territory"]').value = 'XX';
  ```
4. Click **Save** on the form.

**Expected:** Server returns an error: "Select a valid state or territory". The server rejects the invalid value even though the browser allowed it.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 4-016 · Super Admin can change a consultant's availability `[MANUAL]`

**Pre-conditions:** Logged in as `admin@ops.test`.

**Steps:**

1. Navigate to `/admin/users`.
2. Click on **Test Consultant** (`consultant@ops.test`).
3. Find the **Availability** field and change it to `On leave`.
4. Click **Save**.
5. Navigate to `/admin/consultants`.
6. Find Test Consultant in the list and check the availability badge.
7. Check Supabase dashboard → `users` table → `consultant@ops.test` → `availability` column.

**Expected:** Badge shows "On leave" on the consultants page. `availability = on_leave` in DB.

> **Cleanup:** Change availability back to `available` after confirming.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 4-017 · Super Admin can reset a user's 2FA `[MANUAL]`

**Pre-conditions:** The invited user from 3-001 has TOTP enrolled (completed 3-012). Logged in as `admin@ops.test`.

**Steps:**

1. Navigate to `/admin/users`.
2. Find the invited user and click their name.
3. Find the **Reset 2FA** button and click it.
4. Check Supabase dashboard → **Table Editor** → `users` table → that user's row → `totp_enabled` column.
5. Also check: Supabase dashboard → **Authentication** → **Users** → find the user → confirm no MFA factors listed.

**Expected:** `totp_enabled = false` in `users` table. No TOTP factors in Supabase Auth.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 4-018 · Consultants list shows all seeded consultants `[MANUAL]`

**Pre-conditions:** Seed run. Logged in as `admin@ops.test`.

**Steps:**

1. Navigate to `http://localhost:3000/admin/consultants`.
2. Count the rows.
3. Check each consultant's availability badge against the seed data:
  - Test Consultant → Available (green)
  - Sarah Chen → Available (green)
  - Marcus Webb → On leave (yellow)
  - Priya Nair → At capacity (grey)
  - James O'Brien → Available (green)

**Expected:** All 5 consultants shown with correct availability badges.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 4-019 · Locked user indicator appears on the users list `[MANUAL]`

**Pre-conditions:** `client2@ops.test` is locked (from 3-019), or lock one manually. To lock via Supabase dashboard: **Table Editor** → `users` → find `client3@ops.test` → edit the row → set `is_locked = true`.

**Steps:**

1. Navigate to `http://localhost:3000/admin/users`.
2. Find the locked user.

**Expected:** A visual indicator (locked badge, warning icon, or "Locked" label) is visible next to the locked user.


| Result | Notes |
| ------ | ----- |
|        |       |


---

---

# ISSUE #5 — Notification system

> **Session setup:** Keep the Supabase dashboard open → **Table Editor** → `notifications` table to verify DB writes. For email tests, you will need `RESEND_API_KEY` set in `.env.local` — mark email tests as `BLOCKED` if you don't have this key yet.

---

### 5-001 · `notify()` writes a row to the notifications table `[MANUAL]`

**Pre-conditions:** Complete test 6-011 (assigning a consultant) first — that triggers `notify()`.

**Steps:**

1. Complete test 6-011 (assign `consultant@ops.test` to OPS-0001).
2. Open Supabase dashboard → **Table Editor** → `notifications` table.
3. Look for the most recently created row.

**Expected:** A row exists with:

- `recipient_id` = the UUID of `consultant@ops.test`
- `type = "consultant_assigned"`
- `message` contains "OPS-0001"
- `is_read = false`
- `project_id` = OPS-0001's UUID


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 5-002 · `notify()` sends an email via Resend `[MANUAL]`

**Pre-conditions:** `RESEND_API_KEY` is set in `.env.local`. Dev server restarted after adding the key.

**Steps:**

1. Assign a consultant to OPS-0001 (test 6-011) — this triggers a `ConsultantAssignedEmail`.
2. Log in to your Resend dashboard → go to **Emails**.
3. Look for the most recent email sent to `consultant@ops.test`.

**Expected:** Email appears in Resend dashboard with subject "You've been assigned to project OPS-0001".

> Mark as **BLOCKED** if `RESEND_API_KEY` is not yet configured. The DB notification row (5-001) still works without it.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 5-003 · `notify()` fails gracefully — no unhandled crash `[MANUAL]`

**Pre-conditions:** Dev server running with terminal visible.

**Steps:**

1. Open `lib/notifications/notify.ts` in your editor.
2. Read lines 40–46. Verify there is a guard: `if (userResult.error || !userResult.data?.email) return;`
3. Watch the terminal output (`npm run dev` logs) during any notification-triggering action. Look for `[notify]` prefixed lines.

**Expected:** The guard exists in code — it logs an error but does not crash. Confirmed by code review.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 5-004 · Bell icon is visible in the navigation bar `[MANUAL]`

**Pre-conditions:** Logged in as `admin@ops.test`.

**Steps:**

1. Log in as `admin@ops.test`.
2. Look at the top navigation bar on any admin page.

**Expected:** A bell icon is visible in the navbar.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 5-005 · Unread count badge appears on the bell `[MANUAL]`

**Pre-conditions:** At least one unread notification exists. To create one, run:

```bash
npx tsx scripts/seed-notifications.ts
```

Then refresh the admin page.

**Steps:**

1. After the seed script runs, refresh the page.
2. Look at the bell icon.

**Expected:** A red circular badge with a number is visible on the bell icon.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 5-006 · No badge when all notifications are read `[MANUAL]`

**Pre-conditions:** 5-012 (mark all read) has been completed.

**Steps:**

1. After marking all notifications as read, observe the bell icon.

**Expected:** No red badge on the bell icon.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 5-007 · Tray opens on clicking the bell `[MANUAL]`

**Pre-conditions:** Logged in as `admin@ops.test`.

**Steps:**

1. Click the bell icon.

**Expected:** A dropdown tray appears below the bell icon.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 5-008 · Empty state shown when no notifications exist `[MANUAL]`

**Pre-conditions:** Log in as `admin@ops.test` before running any assignment tests and before running the seed-notifications script.

**Steps:**

1. Click the bell icon.
2. Observe the tray contents.

**Expected:** The text "No notifications" is shown inside the tray.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 5-009 · Notification item shows message text and relative time `[MANUAL]`

**Pre-conditions:** At least one notification exists in the tray.

**Steps:**

1. Click the bell icon to open the tray.
2. Look at each notification item.

**Expected:** Each item shows the notification message text and a relative time string (e.g. "just now", "5m ago", "2h ago").


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 5-010 · Unread items are visually highlighted `[MANUAL]`

**Pre-conditions:** At least one unread notification in the tray.

**Steps:**

1. Open the tray by clicking the bell.
2. Compare unread items vs read items visually.

**Expected:**

- Unread items: blue/light-blue background with a small blue dot on the left
- Read items: plain white background, no dot


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 5-011 · Clicking an unread item marks it as read `[MANUAL]`

**Pre-conditions:** At least one unread notification visible in the tray.

**Steps:**

1. Open the tray.
2. Click on one **unread** (blue-highlighted) notification item.
3. Observe the item immediately after clicking.
4. Open Supabase dashboard → `notifications` table → find that row → check `is_read`.

**Expected:** The item loses its blue background. The dot disappears. `is_read = true` in the DB. The badge count decreases by 1.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 5-012 · "Mark all read" clears all unread items `[MANUAL]`

**Pre-conditions:** Multiple unread notifications in the tray.

**Steps:**

1. Open the tray.
2. Confirm there are unread items (blue-highlighted).
3. Click **Mark all read** (top-right of the tray).
4. Observe all items.
5. Observe the bell icon badge.

**Expected:** All items become white background. The red badge disappears from the bell icon.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 5-013 · "View →" link navigates to the project and closes tray `[MANUAL]`

**Pre-conditions:** A notification with a `project_id` attached (e.g. from the assignment notification in 6-012).

**Steps:**

1. Open the tray.
2. Find a notification with a **"View →"** link on the right side.
3. Click **"View →"**.

**Expected:** Browser navigates to `/admin/projects/[project-id]`. The tray closes.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 5-014 · Tray fetches fresh notifications when opened `[MANUAL]`

**Pre-conditions:** Two browser windows (or two different browsers) available.

**Steps:**

1. In **Browser A**: Log in as `consultant@ops.test`. Do **not** click the bell yet.
2. In **Browser B**: Log in as `admin@ops.test` and assign `consultant@ops.test` to OPS-0001 (test 6-011).
3. Go back to **Browser A** — same page load, no refresh.
4. Click the bell icon.

**Expected:** The new assignment notification appears in the tray even though Browser A's page was never refreshed.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 5-015 to 5-021 · Email templates render without errors `[MANUAL]`

**Pre-conditions:** Dev server running, terminal available.

**Steps:**

1. Open a terminal at the project root.
2. Run each command one by one — any error output = FAIL for that template:
  ```bash
   npx tsx -e "import('./lib/email/templates/AcknowledgementEmail').then(m => console.log('AcknowledgementEmail: OK'))"
   npx tsx -e "import('./lib/email/templates/ConsultantAssignedEmail').then(m => console.log('ConsultantAssignedEmail: OK'))"
   npx tsx -e "import('./lib/email/templates/ApprovalRequestEmail').then(m => console.log('ApprovalRequestEmail: OK'))"
   npx tsx -e "import('./lib/email/templates/ModificationsRequestedEmail').then(m => console.log('ModificationsRequestedEmail: OK'))"
   npx tsx -e "import('./lib/email/templates/PBDRDeliveryEmail').then(m => console.log('PBDRDeliveryEmail: OK'))"
   npx tsx -e "import('./lib/email/templates/CreditDeductionEmail').then(m => console.log('CreditDeductionEmail: OK'))"
   npx tsx -e "import('./lib/email/templates/LowCreditEmail').then(m => console.log('LowCreditEmail: OK'))"
  ```

**Expected:** All 7 print `OK` with no error output.


| Template                            | Result | Notes |
| ----------------------------------- | ------ | ----- |
| 5-015 · AcknowledgementEmail        |        |       |
| 5-016 · ConsultantAssignedEmail     |        |       |
| 5-017 · ApprovalRequestEmail        |        |       |
| 5-018 · ModificationsRequestedEmail |        |       |
| 5-019 · PBDRDeliveryEmail           |        |       |
| 5-020 · CreditDeductionEmail        |        |       |
| 5-021 · LowCreditEmail              |        |       |


---

---

# ISSUE #6 — Consultant assignment & availability

> **Session setup:** Have two browser windows ready — one logged in as `admin@ops.test`, one as `consultant@ops.test`. Keep Supabase dashboard open to verify DB changes.

---

### 6-001 · Availability page loads for a consultant `[MANUAL]`

**Pre-conditions:** Logged in as `consultant@ops.test`.

**Steps:**

1. Log in as `consultant@ops.test` / `Ops@TestPass1!`.
2. Navigate to `http://localhost:3000/availability`.
3. Observe the page.

**Expected:** Page loads with three option buttons: **Available**, **On leave**, **At capacity**. The currently active status (Available, from seed data) has a dark background. A small line at the bottom reads "Current status: Available".


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 6-002 · Consultant sets availability to On Leave `[MANUAL]`

**Pre-conditions:** On `/availability` as `consultant@ops.test`.

**Steps:**

1. Click the **On leave** button.
2. Wait for the page to update.
3. Check Supabase dashboard → `users` table → `consultant@ops.test` row → `availability` column.
4. Check the "Current status" label at the bottom of the page.

**Expected:** "On leave" button is now dark/selected. `availability = on_leave` in DB. "Current status: On leave" shown.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 6-003 · Consultant sets availability to At Capacity `[MANUAL]`

**Pre-conditions:** On `/availability` as `consultant@ops.test`.

**Steps:**

1. Click **At capacity**.
2. Check DB and page label as in 6-002.

**Expected:** `availability = at_capacity` in DB. Page updates accordingly.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 6-004 · Consultant sets availability back to Available `[MANUAL]`

**Pre-conditions:** On `/availability`, currently set to something other than Available.

**Steps:**

1. Click **Available**.
2. Check DB and page label.

**Expected:** `availability = available` in DB. "Available" button is selected.

> **Cleanup:** Leave this user as `available` before running the assignment tests below so they appear correctly in the dropdown.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 6-005 · Active status button is disabled `[MANUAL]`

**Pre-conditions:** On `/availability` as `consultant@ops.test`.

**Steps:**

1. Observe the currently selected (dark background) button.
2. Open DevTools → **Elements** tab.
3. Click on the active button in the browser to inspect it in the DOM.
4. Look for the `disabled` attribute in the HTML.
5. Try clicking the active button — it should not respond.

**Expected:** The active button has a `disabled` attribute in the DOM and is not interactive.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 6-006 · Client role cannot access `/availability` `[MANUAL]`

**Pre-conditions:** Logged in as `client@ops.test`.

**Steps:**

1. Log in as `client@ops.test` / `Ops@TestPass1!`.
2. Navigate to `http://localhost:3000/availability`.

**Expected:** Redirected away — the availability page does **not** load for a client.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 6-007 · Admin projects list shows OPS-0001 `[MANUAL]`

**Pre-conditions:** Seed run. Logged in as `admin@ops.test`.

**Steps:**

1. Navigate to `http://localhost:3000/admin/projects`.
2. Look for a project with the reference OPS-0001 or status "Submitted".

**Expected:** OPS-0001 appears in the list with status "Submitted".


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 6-008 · Project detail page loads with correct data `[MANUAL]`

**Pre-conditions:** 6-007 completed.

**Steps:**

1. Click on OPS-0001 in the projects list.
2. Observe the detail page.

**Expected:** The page shows: Organisation (Stockland), PO number (PO-2024-001), Status (Submitted), a consultant assignment dropdown and an **Assign** button.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 6-009 · Consultant dropdown shows name and availability `[MANUAL]`

**Pre-conditions:** On OPS-0001 detail page.

**Steps:**

1. Click the consultant dropdown (labelled "Select a consultant…").
2. Read through all the options.

**Expected:** Each option shows the consultant's name and availability, e.g.:

- `Test Consultant — Available`
- `Sarah Chen — Available`
- `Marcus Webb — On leave`
- `Priya Nair — At capacity`
- `James O'Brien — Available`


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 6-010 · Consultants on leave are still shown in the dropdown `[MANUAL]`

**Pre-conditions:** On OPS-0001 detail page with dropdown open.

**Steps:**

1. Open the consultant dropdown.
2. Look specifically for Marcus Webb.

**Expected:** "Marcus Webb — On leave" is present. On-leave consultants are **not** filtered out — they are shown so the Super Admin can make an informed choice.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 6-011 · Super Admin assigns a consultant `[MANUAL]`

**Pre-conditions:** On OPS-0001 detail page. Project is unassigned (status: Submitted).

**Steps:**

1. Open the consultant dropdown.
2. Select: **Test Consultant — Available**.
3. Click **Assign**.
4. Wait for the page to reload.
5. Check Supabase dashboard → `projects` table → OPS-0001 → `assigned_consultant_id` and `status` columns.

**Expected:** Page reloads showing "Currently assigned to Test Consultant". Status badge changes to "Assigned". In DB: `status = assigned` and `assigned_consultant_id` is set.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 6-012 · Assignment creates a notification row for the consultant `[MANUAL]`

**Pre-conditions:** 6-011 completed.

**Steps:**

1. Open Supabase dashboard → **Table Editor** → `notifications` table.
2. Sort by `created_at` descending — look at the most recent row.
3. Cross-reference `recipient_id` against the `users` table to confirm it belongs to `consultant@ops.test`.

**Expected:** A notification row exists with `recipient_id` = Test Consultant's UUID, `type = "consultant_assigned"`, `is_read = false`, `project_id` = OPS-0001's UUID.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 6-013 · Assignment notification message is correct `[MANUAL]`

**Pre-conditions:** 6-012 completed.

**Steps:**

1. In Supabase dashboard → `notifications` table, read the `message` column of the assignment row.

**Expected:** `"You have been assigned to project OPS-0001."`


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 6-014 · Assignment form changes to "Reassign" after first assignment `[MANUAL]`

**Pre-conditions:** 6-011 completed.

**Steps:**

1. Reload the OPS-0001 detail page (**Cmd+R** / **Ctrl+R**).
2. Look at the assignment section.

**Expected:** Text above the dropdown reads "Currently assigned to **Test Consultant** — Available". The button label is **Reassign**, not "Assign".


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 6-015 · Super Admin can reassign to a different consultant `[MANUAL]`

**Pre-conditions:** OPS-0001 is already assigned to Test Consultant (from 6-011).

**Steps:**

1. On OPS-0001 detail page, open the dropdown and select: **Sarah Chen — Available**.
2. Click **Reassign**.
3. After reload, check Supabase dashboard → `projects` table → OPS-0001 → `assigned_consultant_id`.
4. Check `notifications` table for a new row for Sarah Chen.

**Expected:** `assigned_consultant_id` updated to Sarah Chen's UUID. A new `consultant_assigned` notification exists for Sarah Chen.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 6-016 · Locked consultants do not appear in the dropdown `[MANUAL]`

**Pre-conditions:** Logged in as `admin@ops.test`.

**Steps:**

1. Lock James O'Brien via Supabase dashboard → **Table Editor** → `users` → find `consultant5@ops.test` → edit the row → set `is_locked = true` → save.
2. Navigate to OPS-0001 detail page.
3. Open the consultant dropdown.
4. Look for James O'Brien.

**Expected:** "James O'Brien" does **not** appear in the dropdown.

> **Cleanup:** Set `is_locked = false` for `consultant5@ops.test` in the dashboard after testing.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 6-017 · Consultants admin page lists all consultants `[MANUAL]`

**Pre-conditions:** Seed run. Logged in as `admin@ops.test`. All consultants unlocked.

**Steps:**

1. Navigate to `http://localhost:3000/admin/consultants`.
2. Count the rows.
3. Verify each name: Test Consultant, Sarah Chen, Marcus Webb, Priya Nair, James O'Brien.

**Expected:** All 5 seeded consultants are listed.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### 6-018 · Availability badge colours are correct `[MANUAL]`

**Pre-conditions:** On `/admin/consultants` page.

**Steps:**

1. Look at each consultant's availability badge colour:
  - Test Consultant, Sarah Chen, James O'Brien → should be green
  - Marcus Webb → should be yellow
  - Priya Nair → should be grey
  - Any locked consultant → should be red

**Expected:**

- Available → **green** badge
- On leave → **yellow** badge
- At capacity → **grey** badge
- Locked → **red** badge


| Result | Notes |
| ------ | ----- |
|        |       |


---

---

# CROSS-CUTTING / SECURITY

> These tests verify the API cannot be called by the wrong role using browser DevTools.

---

### X-001 · Unauthenticated request to assign API returns 403 `[MANUAL]`

**Pre-conditions:** Not logged in (incognito window). Get OPS-0001's UUID from Supabase dashboard → `projects` table.

**Steps:**

1. Open an incognito/private browser window.
2. Open DevTools → **Console** tab.
3. Run (replace `PROJECT_UUID` with the actual UUID):
  ```javascript
   fetch('/api/projects/PROJECT_UUID/assign', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ consultant_id: 'test' })
   }).then(r => console.log('Status:', r.status));
  ```

**Expected:** Console prints `Status: 403`.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### X-002 · Client session cannot call the assign API `[MANUAL]`

**Pre-conditions:** Logged in as `client@ops.test`. OPS-0001's UUID ready.

**Steps:**

1. Log in as `client@ops.test`.
2. Open DevTools → **Console** tab.
3. Run (replace `PROJECT_UUID`):
  ```javascript
   fetch('/api/projects/PROJECT_UUID/assign', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ consultant_id: 'test' })
   }).then(r => console.log('Status:', r.status));
  ```

**Expected:** Console prints `Status: 403`.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### X-003 · Consultant session cannot call the assign API `[MANUAL]`

**Pre-conditions:** Logged in as `consultant@ops.test`. OPS-0001's UUID ready.

**Steps:**

1. Log in as `consultant@ops.test`.
2. Open DevTools → **Console** tab.
3. Run the same fetch command as X-002.

**Expected:** Console prints `Status: 403`.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### X-004 · Admin server actions require super_admin role `[MANUAL]`

**Pre-conditions:** Logged in as `client@ops.test`.

**Steps:**

1. Log in as `client@ops.test`.
2. Navigate directly to `http://localhost:3000/admin/users/invite`.

**Expected:** Redirected away — the invite page does **not** load for a client.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### X-005 · RLS: client cannot read another user's notifications `[MANUAL]`

**Pre-conditions:** Logged in as `client@ops.test`. Notifications exist for other users (from assignment tests).

**Steps:**

1. Log in as `client@ops.test`.
2. Open DevTools → **Network** tab.
3. Click the bell icon to trigger a call to `/api/notifications`.
4. In the Network tab, click the `/api/notifications` request.
5. Click the **Response** tab and read the JSON array returned.

**Expected:** The array only contains notifications where `recipient_id` matches `client@ops.test`'s UUID. Notifications for admin or consultants are **not** in the response.


| Result | Notes |
| ------ | ----- |
|        |       |


---

### X-006 · RLS: client cannot read projects from another org `[MANUAL]`

**Pre-conditions:** Logged in as `client@ops.test` (Stockland org).

**Steps:**

1. Verify the RLS policy exists via Supabase dashboard → **Authentication** → **Policies** → click the `projects` table.
2. Confirm a policy named "Clients can read their org projects" exists with the condition:
  `org_id IN (SELECT org_id FROM users WHERE id = auth.uid())`

**Expected:** Policy is present. Clients can only ever see projects belonging to their own org.


| Result | Notes |
| ------ | ----- |
|        |       |


---

---

# SUMMARY TRACKER

Update this table as you complete tests.


| Issue                         | Total   | Pass | Fail | Blocked | N/A   | Remaining |
| ----------------------------- | ------- | ---- | ---- | ------- | ----- | --------- |
| Automated (A-001–005)         | 5       |      |      |         |       | 5         |
| #2 Infrastructure (2-001–007) | 7       |      |      |         | 1     | 6         |
| #3 Auth (3-001–030)           | 30      |      |      |         |       | 30        |
| #4 Org & Users (4-001–019)    | 19      |      |      |         |       | 19        |
| #5 Notifications (5-001–021)  | 21      |      |      |         |       | 21        |
| #6 Assignment (6-001–018)     | 18      |      |      |         |       | 18        |
| Cross-cutting (X-001–006)     | 6       |      |      |         |       | 6         |
| **Total**                     | **106** |      |      |         | **1** | **105**   |


---

## Known issues / pre-existing flags


| Flag                             | Detail                                                                                                                                                                                    |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ESLint warning (A-002)           | `Resend` class imported but not used in `lib/email/sender.ts`. Non-blocking — does not affect functionality.                                                                              |
| 2FA bypass for seed accounts     | Seeded accounts skip 2FA by design (dev convenience). Test the full 2FA enrollment flow using a fresh invited user — do not use seed accounts for tests 3-001 to 3-012.                   |
| Email tests require Resend key   | Test 5-002 requires `RESEND_API_KEY` in `.env.local`. Mark as BLOCKED if key is unavailable — the DB notification row (5-001) still works without it.                                     |
| Session expiry tests (3-028–030) | These only verify the cookie is set with the correct expiry value at login time. Waiting the full 4–8 hours to confirm actual expiry is not practical — cookie value check is sufficient. |


---

---

## Docker footnote

Docker is **not required** for issues #2–#6 because Supabase is cloud-hosted and no PDF generation features are tested in this range.

Docker will become required for the following:


| When                                           | Why                                                                                                                                                                                                                                                                         |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Gotenberg / PDF generation** (future issues) | The `ops-pdf` service (`gotenberg/gotenberg:8` Docker image) handles `.docx → PDF` conversion. This is needed when testing PBDB generation, PBDR delivery, and the document watermark removal feature. Run `docker-compose up -d` to start it locally before those tests.   |
| **Local Supabase** (optional)                  | If you ever want a fully offline dev environment — e.g. to run destructive DB tests without affecting your cloud data — you can run `npx supabase start` to spin up a local Supabase instance in Docker. This is optional; cloud Supabase works fine for all current tests. |
| **Test 2-003** (Gotenberg health check)        | This test is marked N/A in the current QA run. Re-enable it when testing PDF features by running `docker-compose up -d` and then `curl http://localhost:3001/health`.                                                                                                       |


