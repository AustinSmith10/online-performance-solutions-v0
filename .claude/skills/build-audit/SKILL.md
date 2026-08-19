---
name: build-audit
description: Audit this repo against the scar-tissue engineering guide (references/guide.md) and write a ranked AUDIT.md. Use whenever the user asks to audit the build/repo, run a security or pre-deploy check, scan for footguns, "check my repo", "audit before deploy", or invokes /build-audit. Two modes — quick (default, minutes, grep-driven) and deep (full section-by-section agent fan-out; use when the user says "deep", "full", "thorough", or is about to do a real release).
---

# Build Audit

Audit the current repository against `references/guide.md` (the "What Software Needs Beyond the Idea" handbook) and produce a ranked findings report.

## Mode selection

- Default to **quick** mode. Use **deep** mode only if the user asked for a deep/full/thorough audit or is preparing a production release.
- In both modes, finish by writing/updating `AUDIT.md` at the repo root (format below) and summarising the top findings in chat.

## Step 0 — Project profile (both modes)

The audit MUST be calibrated to what this project actually is — its users, stage, and data — not just its code. That context is declared, not guessed:

1. Look for `.claude/skills/build-audit/PROFILE.md` (or `AUDIT-PROFILE.md` at repo root).
2. **If it exists**: read it and calibrate everything downstream against it (see "Calibration" below). If code contradicts it (profile says "no payments" but Stripe is in package.json), flag the drift and ask whether to update the profile.
3. **If it doesn't exist (first run)**: ask the user before scanning — use AskUserQuestion where available, plain questions otherwise. If the session is unattended, infer best-effort from the code, state the assumptions at the top of AUDIT.md, and write them to the profile marked `inferred: true` for the user to correct. Ask:
   - **Stage**: prototype / launched with free users / paying customers / established with team
   - **Users & audience**: roughly how many; consumers, businesses, or internal? Any enterprise customers?
   - **Data sensitivity**: what's the most sensitive thing stored? (none / basic PII / financial / health / children's data / other-people's-customer-data)
   - **Money**: does it charge? subscriptions, usage-based, or one-off?
   - **Tenancy**: single-user, per-user data, or multi-tenant orgs/teams?
   - **Jurisdictions**: where are users? (drives GDPR/CCPA/AU checks)
   - **Blast radius** (one line, user's words): "what's the worst realistic outcome if this app is breached or down for a day?"
4. Write/update the profile file — short YAML-ish frontmatter plus the blast-radius line, with a `last_reviewed` date. If `last_reviewed` is >6 months old, ask one line: "profile still accurate?"

### Calibration — how the profile changes the audit

- **Stage gates**: prototype → only [Day 1] items are findings; [Before first real users] items go to a "before you launch" list, later tags are omitted. Launched → [Day 1] + [Before first real users] are findings. Paying customers → add [Before it matters]. Team/established → everything.
- **Severity scaling**: the same defect changes severity with context. IDOR: MEDIUM in a solo prototype, CRITICAL with real users' data. Missing webhook idempotency: LOW with no payments, HIGH with revenue. Unbounded LLM spend: scale to whether keys have real billing attached.
- **Section selection**: no payments → skip §10 checks except "don't build billing wrong later" notes. No LLM calls → skip §9. Single-user tool → tenancy checks collapse to auth checks. EU users declared → GDPR-adjacent items become findings rather than notes; AU-based → Privacy Act/NDB items apply.
- **Data sensitivity floor**: health, children's, or other-people's-customer-data sets a floor — security/authz sections run at full depth regardless of stage, and the report says why.
- **Blast radius** is tie-break context: when unsure whether something is worth flagging, ask "does this touch the user's stated worst outcome?"

## Step 0.5 — Orient in the code (both modes)

1. Detect the stack before scanning; skip checks that don't apply. Look at: `package.json` (next? prisma? drizzle? stripe? openai/anthropic? @supabase?), `requirements.txt`/`pyproject.toml`, `supabase/` dir, `vercel.json`, `.github/workflows/`, `Dockerfile`.
2. Identify the entry points: API routes / route handlers / server actions, webhook handlers, cron routes, LLM-calling code, DB client setup, auth setup, middleware.
3. If a previous `AUDIT.md` exists, read it — re-check its open findings and mark resolved ones.

## Quick mode

Run the high-signal checks below with Grep/Glob/Read. These are the known footgun patterns from the guide; each maps to a guide section (cite it in findings). Do not report a match mechanically — read the surrounding code and confirm it is a real instance, not a false positive (e.g. `service_role` in server-only code is fine; in client-reachable code it is critical).

### Secrets & key exposure (guide §2, §8)
- `service_role`, `sb_secret_`, `SUPABASE_SERVICE` referenced in client-reachable code (`"use client"` files, `pages/`, `components/`, anything bundled). CRITICAL if found.
- `NEXT_PUBLIC_` env vars whose names suggest secrets (KEY, SECRET, TOKEN — excluding known-publishable ones).
- Hardcoded API keys/tokens: patterns like `sk-`, `sk_live_`, `whsec_`, `AKIA`, `-----BEGIN`, long base64 assigned to key-ish names. Check `.env*` files are gitignored; if any were ever committed, flag for rotation (check `git log --all --diff-filter=A -- '*.env*'`).
- Committed lockfile present, and CI uses `npm ci` (not `npm install`).

### Authorization & tenancy (guide §1, §2)
- Route handlers / server actions with no session/auth check before DB access. List every handler; for each, confirm an auth check exists in the handler itself (middleware alone is a finding, MEDIUM).
- Queries that fetch by ID from request params without scoping to the current user/tenant (`findUnique({ where: { id: params.id }})` with no ownership check) — the IDOR pattern. HIGH.
- `req.body` / parsed body spread directly into create/update calls (mass assignment). Check for `.strict()` or explicit field allowlists.
- If Supabase: tables in `public` schema without RLS (check migrations for `ENABLE ROW LEVEL SECURITY`, or note as "verify in dashboard" with the SQL from guide §2 cheap wins). UPDATE policies missing `WITH CHECK`.

### Unbounded calls & resilience (guide §5)
- `fetch(` calls with no `AbortSignal`/timeout; axios/httpx clients with no timeout configured.
- Webhook handlers (Stripe/Supabase/provider) — verify: signature verification present, idempotency (processed-events table or equivalent), fast 200 response. Missing idempotency = HIGH (guide §4, §10).
- Retry loops without backoff/jitter.

### Injection & rendering (guide §1)
- `dangerouslySetInnerHTML`, `rehype-raw`, markdown rendered from user or LLM content without sanitisation.
- String-built SQL (template literals containing `SELECT`/`INSERT` with `${`), `eval(`, `pickle.loads`, `yaml.load(` without SafeLoader.
- User-supplied URLs fetched server-side (SSRF surface) — image fetchers, webhook-URL features, LLM tools that fetch.

### LLM endpoints (guide §3, §9)
- Routes calling OpenAI/Anthropic/etc.: confirm auth required, `max_tokens` set, input length capped, some rate limit or budget check present. Unauthenticated LLM endpoint = CRITICAL.
- Model version pinned (dated snapshot) vs floating alias.
- LLM output rendered without sanitisation or schema validation (`JSON.parse` on raw completion with no zod/schema + retry handling).

### Money (guide §10)
- Prices/amounts taken from client input rather than created server-side. CRITICAL.
- Entitlement checks: UI-only gating with no API-layer check.
- Test/live key mode assertion at boot (nice-to-have; absence is LOW unless other billing findings exist).

### Migrations & data (guide §4)
- Migration files creating indexes without `CONCURRENTLY`, adding NOT NULL columns without safe pattern, no `lock_timeout` set.
- `float`/`real` columns or JS numbers used for money.
- App DB connection using the direct (5432) rather than pooled string on serverless.

### CI & headers (guide §7, §1)
- CI workflow: are typecheck, tests, and a secret scanner (gitleaks) required? Actions pinned by SHA?
- Security headers middleware present (frame-ancestors/HSTS/nosniff/Referrer-Policy)? CSP at least report-only?
- CORS configured with `*` plus credentials, or reflecting arbitrary origin.

## Deep mode

Do everything in quick mode, then fan out subagents with the Agent tool — one per applicable guide section (skip sections with no repo surface, e.g. §11 legal if there's nothing to check in code). Give each agent:
- its section's full text from `references/guide.md` (tell it the file path and section heading to Read),
- the stack summary from Step 0,
- instructions to verify each applicable item against the actual code and return findings as a list of `{severity, title, file:line, guide_item, evidence, fix}` — findings must cite real file/line evidence, no speculation.

Run agents concurrently. Then verify: re-check each CRITICAL/HIGH finding yourself by reading the cited code before it goes in the report. Discard anything that doesn't reproduce.

## AUDIT.md format

```markdown
# Build Audit — <repo name>
_Last run: <date> · mode: quick|deep · guide: software-beyond-the-idea v2_
_Profile: <stage> · <user summary> · data: <sensitivity> · <money model>_

## Summary
<counts by severity; one-line overall assessment>

## Findings
### CRITICAL
- [ ] **<title>** — `path/to/file:line`
  Guide: §<n> <item>. <what's wrong and the failure scenario in 1–2 sentences>
  Fix: <concrete change>
### HIGH / MEDIUM / LOW
<same shape>

## Resolved since last run
- [x] <title> (resolved <date>)

## Not checked / needs manual verification
<dashboard-only items: RLS state, provider spend caps, backup restore test, DNS/registrar locks>
```

Severity guide: CRITICAL = exploitable now or data/money loss (leaked service key, unauth LLM/billing endpoint, IDOR). HIGH = one incident away (no webhook idempotency, unbounded calls on hot paths, unsafe migration pattern). MEDIUM = weakens defence in depth. LOW = hygiene.

Keep prior resolved findings in the file so progress is visible. End in chat with: severity counts, the top 3 findings, and an offer to fix them.

## Rules

- Never mark a finding resolved without re-reading the code.
- Confirmed real instances only — a grep hit is a lead, not a finding.
- Don't pad. A clean area is one line in the summary, not a section of praise.
- Calibrate every finding against the profile (Step 0) — stage gates, severity scaling, and section selection are not optional. A report that flags [Scale] items at a prototype, or soft-pedals authz on sensitive data, is a failed audit.
- Deep-mode subagents must receive the profile in their prompt alongside their guide section.
