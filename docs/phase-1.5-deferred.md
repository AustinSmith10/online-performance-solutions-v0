# Phase 1.5 — Deferred Renames

These changes were deferred from v1.0 to avoid database migrations, Supabase schema changes, and breaking URL changes. All UI label renames are completed in v1.0.

---

## 1. URL Route Renames

| Current URL | Target URL | Notes |
|---|---|---|
| `/admin/organisations` | `/admin/clients` | Organisation → Client rename |
| `/admin/organisations/[id]` | `/admin/clients/[id]` | All nested routes follow |
| `/admin/clients` | `/admin/stakeholders` | Client (person) → Stakeholder rename |
| `/admin/clients/[id]` | `/admin/stakeholders/[id]` | All nested routes follow |

Add permanent redirects (301) from old URLs to new URLs to avoid breaking bookmarks and shared links.

---

## 2. Supabase Table Renames

| Current Table | Target Table | Notes |
|---|---|---|
| `organisations` | `clients` | Organisation → Client |

All `supabase.from("organisations")` calls across the codebase must be updated. Known locations:
- `lib/documents/generator.ts`
- `lib/documents/delivery.ts`
- `app/actions/organisations.ts` (file itself should be renamed to `clients.ts`)
- `app/actions/projects.ts`
- `app/actions/submission.ts`
- `app/actions/credits.ts`
- `app/actions/recovery.ts`
- `app/actions/templates.ts`

---

## 3. Supabase Column / Field Renames

| Current Field | Target Field | Table | Notes |
|---|---|---|---|
| `org_id` | `client_id` | `projects`, `profiles`, and any join tables | Pervasive — appears in dozens of queries |
| `org_config` | `client_config` | `clients` (formerly `organisations`) | |

All `org_id` references in server actions, lib functions, and type definitions must be updated.

---

## 4. User Role Value Rename

| Current Value | Target Value | Notes |
|---|---|---|
| `"client"` (role string) | `"stakeholder"` | Stored in `profiles.role` column in Supabase |

This requires a data migration on the `profiles` table and updates to every `role === "client"` check across the codebase. Known locations:
- `lib/auth/` — role guards and `requireRole()` calls
- `app/actions/projects.ts`, `submission.ts`, `admin-users.ts`, `portalApproval.ts`
- `app/actions/auth.ts`
- Middleware role routing logic

---

## 5. File / Action Renames

| Current File | Target File | Notes |
|---|---|---|
| `app/actions/organisations.ts` | `app/actions/clients.ts` | Rename action file to match new domain term |

---

## 6. Supabase RPC / Function Renames

| Current Name | Target Name | Notes |
|---|---|---|
| `admin_delete_organisation` | `admin_delete_client` | RPC called in `app/actions/organisations.ts` |

---

## 7. Storage Path Updates

PBDB and PBDR files are stored under paths keyed by `org_id`:
```
documents/{org_id}/{projectId}/pbdb/...
documents/{org_id}/{projectId}/pbdr/...
```
These paths are baked into existing stored records. A migration strategy is needed — either rename existing buckets/paths or maintain a path alias layer.

---

## Notes

- All changes in this file require a coordinated deployment: schema migration + code deploy in a single release window.
- The role value rename (#4) has the widest blast radius — it touches auth middleware, RLS policies in Supabase, and every role check in the codebase.
- Recommend tackling in order: Tables (#2) → Columns (#3) → Role values (#4) → URLs (#1) → Files (#5) → RPCs (#6).
- Storage paths (#7) should be scoped and planned separately given the risk of data loss.
