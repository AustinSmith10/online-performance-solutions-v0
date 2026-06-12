# OPS Project — Handoff Document

**Date:** 2026-06-09  
**Project:** online-performance-solution-v0  
**Working directory:** `/Users/ddeg/Desktop/online-performance-solution-v0`  
**Branch:** `main` (clean)

---

## What this session covered

This session focused on running the QA plan for issues #2–6. Most of the session was spent diagnosing a blocker in test **3-003** (invite link → complete-profile screen).

---

## Current blocker — test 3-003

**Symptom:** Clicking the Supabase invite email link lands on `/login?error=invalid-link` instead of `/complete-profile`.

**Root cause diagnosed:** The `/auth/confirm` route handler was only handling the OTP token-hash flow (`token_hash` + `type` query params). However `@supabase/ssr` defaults to PKCE, which sends a `code` param instead. Server logs confirmed both confirm requests had `application-code: ~9ms` — too fast for any async call, meaning the handler fell straight through without executing.

**Fix applied (already committed):** `app/auth/confirm/route.ts` was updated to handle both flows:
- `?code=xxx` → `supabase.auth.exchangeCodeForSession(code)` (PKCE)
- `?token_hash=xxx&type=xxx` → `supabase.auth.verifyOtp(...)` (OTP)

**Debug logging also added** (temporary — remove after 3-003 is confirmed passing):
```typescript
console.log("[auth/confirm] full URL:", request.url);
console.log("[auth/confirm] params:", Object.fromEntries(searchParams.entries()));
```
These lines are at the top of the `GET` handler in `app/auth/confirm/route.ts`.

**Current secondary blocker — email rate limit:** Supabase's built-in mailer caps at ~3–4 emails/hour. The cap was hit during testing. Two resolution paths:

1. **Recommended:** Configure Resend as custom SMTP in Supabase dashboard → Project Settings → Authentication → SMTP Settings:
   - Host: `smtp.resend.com`, Port: `465`, Username: `resend`
   - Password: value of `RESEND_API_KEY` from `.env.local`
   - Sender: a verified Resend domain address

2. **Quick workaround:** Wait ~1 hour, then invite `jonashgoh@gmail.com` (or use `fire@ddeg.com.au`). The Supabase auth user table is currently clean — `jonashgoh@gmail.com` was deleted.

---

## QA plan status

Full plan is at: `QA_PLAN.md` in the project root.

| Test | Status | Notes |
|------|--------|-------|
| A-001–005 | PASS | Automated checks all green |
| 2-007 | PASS | CI passes on push |
| 3-001 | PASS | Super Admin sends invite |
| 3-002 | PASS | Invite email received |
| 3-003 | **BLOCKED** | Fix applied; waiting for email rate limit reset to re-test |
| 3-004 onwards | Not yet tested | Depends on 3-003 |
| All #4, #5, #6, X-001–006 | Not yet tested | |

---

## Changes made this session

### `app/auth/confirm/route.ts`
- Added `code` param handling (PKCE flow) via `exchangeCodeForSession`
- Added temporary debug console.log lines (remove after 3-003 confirmed)
- Original `token_hash`/`type` handling retained as fallback

### `package.json`
- Added `seed` script (previous session): `node --env-file=.env.local ./node_modules/.bin/tsx supabase/seed.ts`
- Reason: `tsx` doesn't auto-load `.env.local`; running `npm run seed` is the correct way

---

## Test accounts

All created by `npm run seed`. Password for all: `Ops@TestPass1!` (redacted here — see seed output).

| Role | Email |
|------|-------|
| Super Admin | `admin@ops.test` |
| Consultant (available) | `consultant@ops.test` |
| Consultant (available) | `consultant2@ops.test` — Sarah Chen |
| Consultant (on_leave) | `consultant3@ops.test` — Marcus Webb |
| Consultant (at_capacity) | `consultant4@ops.test` — Priya Nair |
| Consultant (available) | `consultant5@ops.test` — James O'Brien |
| Client (Stockland) | `client@ops.test` |
| Client (Stockland) | `client2@ops.test` — Emma Davis |
| Client (Stockland) | `client3@ops.test` — Ryan Thompson |

Dummy project `OPS-0001` (status: submitted, unassigned) exists for assignment tests.

> Seed accounts bypass 2FA by design (`totp_enabled: false`, `profile_complete: true` set directly in auth metadata). Use a fresh invited email for tests 3-001 to 3-012.

---

## Key files to know

| File | Purpose |
|------|---------|
| `app/auth/confirm/route.ts` | Invite link handler — recently fixed |
| `lib/auth/invite.ts` | `sendInvite()` — calls Supabase admin invite API |
| `app/actions/auth.ts` | `login()`, `completeProfile()`, `verifyTotp()` |
| `lib/auth/session.ts` | `getSessionUser()`, `requireRole()`, session durations |
| `supabase/seed.ts` | Creates all test accounts and dummy project |
| `lib/notifications/notify.ts` | Dual-channel notify (DB row + Resend email) |
| `lib/projects/assign.ts` | `performAssignment()` — updates project + triggers notify |

---

## Environment

- **Supabase:** Cloud-hosted (NOT local Docker). Dashboard at `https://supabase.com/dashboard`.
- **Docker:** Not required for issues #2–6. Only needed for Gotenberg (PDF, future issues).
- **Dev server:** `npm run dev`
- **Seed:** `npm run seed`
- **Worker:** `npm run worker` (pg-boss background jobs — not needed for current QA tests)

---

## Memory files

Persistent memory is stored at:  
`/Users/ddeg/.claude/projects/-Users-ddeg-Desktop-online-performance-solution-v0/memory/`

Key files:
- `MEMORY.md` — index
- `ops_prd_decisions.md` — all PRD design decisions (supersede original PRD)
- `project_open_items.md` — deferred decisions (template placeholder mapping session still pending)

---

## Immediate next steps

1. **Unblock 3-003:** Either configure Resend SMTP in Supabase dashboard (recommended) or wait for rate limit reset (~1 hour from last invite attempt). Then send a fresh invite and confirm the debug logs show `code` or `token_hash` params arriving.
2. **Remove debug logs** from `app/auth/confirm/route.ts` once 3-003 passes.
3. **Continue QA plan** from 3-004 onwards (profile completion, password policy, 2FA enrollment).
4. Work through remaining sections: #4 Org & Users, #5 Notifications, #6 Assignment, Cross-cutting security.

---

## Suggested skills

- `/compact` — if context grows long during continued QA testing
- `/handoff` — update this document if the session ends before QA is complete
