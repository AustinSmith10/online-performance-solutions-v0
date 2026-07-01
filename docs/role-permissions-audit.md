# Role-based permissions audit

**Date:** 2026-06-25
**Roles covered:** Super Admin, Admin, Consultant, Client

---

## Legend


| Symbol | Meaning                                            |
| ------ | -------------------------------------------------- |
| ✓      | Full access                                        |
| ~      | Scoped access (limited to assigned/own org)        |
| —      | No access                                          |
| ⚠ GAP  | Missing access relative to what a peer role can do |


---

## Role hierarchy

```
Super Admin  ←  highest privilege, full system control
    ↓
Admin        ←  restricted super admin; cannot manage privileged accounts, override payments, or access the audit log
    ↓
Consultant   ←  scoped to assigned projects only
    ↓
Client       ←  scoped to own organisation only
```

---



## Admin role — definition

Admin is a **Restricted Super Admin**. It is intended for trusted operators who manage day-to-day platform operations without holding the most sensitive system-level powers. The ceiling is:

- **Cannot** invite, manage, or view accounts with role `super_admin` or `admin`
- **Cannot** override payment gates or reconcile deferred payments
- **Cannot** access the audit log
- **Cannot** create new organisations (only manages existing ones)
- **Can** do everything else a Super Admin can, including org settings, templates, credits top-up, user management for `consultant` and `client` accounts, and full project workflow

---



## Dashboard & navigation


| Feature                             | Super Admin        | Admin              | Consultant               | Client         |
| ----------------------------------- | ------------------ | ------------------ | ------------------------ | -------------- |
| Dashboard access                    | ✓ full system view | ✓ full system view | ~ assigned projects only | ~ own org only |
| Real-time project status overview   | ✓                  | ✓                  | —                        | —              |
| Unassigned / overdue / error alerts | ✓                  | ✓                  | —                        | —              |
| Notifications (role-appropriate)    | ✓                  | ✓                  | ✓                        | ✓              |


---



## Project lifecycle


| Feature                      | Super Admin   | Admin         | Consultant      | Client         |
| ---------------------------- | ------------- | ------------- | --------------- | -------------- |
| Submit new project           | ⚠ GAP         | ⚠ GAP         | —               | ✓              |
| View projects                | ✓ all         | ✓ all         | ~ assigned only | ~ own org only |
| Assign consultant to project | ✓             | ✓             | —               | —              |
| Pause / resume project       | ✓             | ✓             | —               | —              |
| Upload additional files      | ✓ any project | ✓ any project | ~ assigned only | ~ own org only |
| Soft-delete draft project    | ⚠ GAP         | ⚠ GAP         | —               | ✓              |
| Restore deleted project      | ✓ any         | ✓ any         | —               | ~ own org only |
| Purge project permanently    | ✓ any         | ✓ any         | —               | ~ own org only |
| View recovery bin            | ✓             | ✓             | —               | ~ own org only |


---



## PBDB (QA document)


| Feature                  | Super Admin   | Admin         | Consultant      | Client |
| ------------------------ | ------------- | ------------- | --------------- | ------ |
| Upload QA PBDB           | ✓ any project | ✓ any project | ~ assigned only | —      |
| Mark QA complete         | ✓ any project | ✓ any project | ~ assigned only | —      |
| Save project / PO number | ✓ any project | ✓ any project | ~ assigned only | —      |
| Resend PBDB to submitter | ✓             | ✓             | —               | —      |


---



## PBDR (delivery report)


| Feature                 | Super Admin | Admin | Consultant | Client                    |
| ----------------------- | ----------- | ----- | ---------- | ------------------------- |
| Trigger PBDR conversion | ✓           | ✓     | —          | —                         |
| Resend PBDR email       | ✓           | ✓     | —          | —                         |
| Download PBDR           | ✓           | ✓     | ⚠ GAP      | ~ delivered/complete only |


---



## Stakeholder management


| Feature                                 | Super Admin | Admin | Consultant      | Client |
| --------------------------------------- | ----------- | ----- | --------------- | ------ |
| Add / remove org-level stakeholders     | ✓           | ✓     | —               | —      |
| Add / remove project-level stakeholders | ✓           | ✓     | —               | —      |
| Dispatch to stakeholders                | ✓           | ✓     | —               | —      |
| View stakeholder reviews                | ✓           | ✓     | ~ assigned only | —      |
| Waive stakeholder response              | ✓           | ✓     | —               | —      |
| Resend stakeholder approval token       | ✓           | ✓     | —               | —      |


---



## Consultant management


| Feature                              | Super Admin | Admin | Consultant | Client |
| ------------------------------------ | ----------- | ----- | ---------- | ------ |
| Update own availability              | ⚠ GAP       | ⚠ GAP | ✓          | —      |
| Update any consultant's availability | ✓           | ✓     | —          | —      |
| View all consultants + availability  | ✓           | ✓     | —          | —      |


---



## User & organisation management


| Feature                                        | Super Admin | Admin                      | Consultant | Client |
| ---------------------------------------------- | ----------- | -------------------------- | ---------- | ------ |
| Invite `consultant` / `client` users           | ✓           | ✓                          | —          | —      |
| Invite `admin` users                           | ✓           | —                          | —          | —      |
| Invite `super_admin` users                     | ✓           | —                          | —          | —      |
| View / manage `consultant` / `client` accounts | ✓           | ✓                          | —          | —      |
| View / manage `admin` accounts                 | ✓           | —                          | —          | —      |
| View / manage `super_admin` accounts           | ✓           | —                          | —          | —      |
| Unlock account / reset TOTP                    | ✓           | ✓ (consultant/client only) | —          | —      |
| Create new organisations                       | ✓           | —                          | —          | —      |
| Update existing org settings                   | ✓           | ✓                          | —          | —      |
| Manage org email whitelist                     | ✓           | ✓                          | —          | —      |
| Freeze / unfreeze organisation                 | ✓           | ✓                          | —          | —      |


---



## Credits & payments


| Feature                               | Super Admin | Admin | Consultant | Client |
| ------------------------------------- | ----------- | ----- | ---------- | ------ |
| Top up org credits                    | ✓           | ✓     | —          | —      |
| Override payment gate                 | ✓           | —     | —          | —      |
| Reconcile override / deferred payment | ✓           | —     | —          | —      |
| View credit ledger                    | ✓           | ✓     | —          | —      |


---



## Templates


| Feature                                     | Super Admin | Admin | Consultant | Client |
| ------------------------------------------- | ----------- | ----- | ---------- | ------ |
| Upload / replace template                   | ✓           | ✓     | —          | —      |
| Activate / deactivate / reactivate template | ✓           | ✓     | —          | —      |
| Manage template field mappings              | ✓           | ✓     | —          | —      |
| Manage file requirements per template       | ✓           | ✓     | —          | —      |


---



## Profile & account


| Feature                    | Super Admin | Admin | Consultant | Client |
| -------------------------- | ----------- | ----- | ---------- | ------ |
| Update own profile         | ✓           | ✓     | ✓          | ✓      |
| Change own password        | ✓           | ✓     | ✓          | ✓      |
| Set up / verify TOTP (2FA) | ✓           | ✓     | ✓          | ✓      |


---



## Audit & compliance


| Feature        | Super Admin | Admin | Consultant | Client |
| -------------- | ----------- | ----- | ---------- | ------ |
| View audit log | ✓           | —     | —          | —      |


---



## Admin role — ceiling summary

These are the deliberate restrictions that separate Admin from Super Admin. They are not gaps — they are intentional hard limits on the Admin role.


| Restricted action                                        | Reason                                                                                                                                        |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Cannot invite or manage `admin` / `super_admin` accounts | Prevents privilege escalation — only a Super Admin can create or modify other privileged accounts                                             |
| Cannot override the payment gate                         | High-risk financial action reserved for Super Admin only                                                                                      |
| Cannot reconcile override / deferred payments            | Same — financial integrity requires Super Admin sign-off                                                                                      |
| Cannot access the audit log                              | Audit log must remain independently verifiable; if an Admin could read it they could also track whether their own actions were being reviewed |
| Cannot create new organisations                          | Organisation creation is a system-level action that affects billing, routing, and access boundaries — kept at Super Admin level               |


---



## Confirmed gaps

These are verified cases where a role is missing access to something a peer role can do, or where an admin-tier role cannot perform an action that represents a legitimate operational need.

---



### GAP 1 — Super Admin and Admin cannot submit a project

**Severity:** High
**Missing for:** Super Admin, Admin
**Peers that have it:** Client

Neither Super Admin nor Admin can create a project. There is no submission flow under `/admin`. The `submitProject()` action in `lib/actions/submission.ts` gates on role `client` only.

**Impact:** If a client has trouble submitting, no admin-tier user can do it on their behalf. It also makes it impossible to test the submission flow end-to-end without a client account.

---



### GAP 2 — Super Admin and Admin cannot soft-delete a draft project

**Severity:** Medium
**Missing for:** Super Admin, Admin
**Peers that have it:** Client

The `softDeleteProject()` action in `lib/actions/recovery.ts` is scoped to `client` only. Super Admin and Admin can restore or permanently purge deleted projects but cannot initiate the deletion themselves.

**Impact:** If a junk or test project needs to be cleaned up, an admin-tier user has to ask the client to delete it first before they can purge it. The flow is asymmetric — they have more destructive power (purge) but not the lighter-touch action (soft-delete).

---



### GAP 3 — Consultant cannot download the PBDR

**Severity:** Medium
**Missing for:** Consultant
**Peers that have it:** Super Admin, Admin, Client

The consultant uploads the QA PBDB and marks QA complete, but has no access to download the final PBDR that is generated from it. The download endpoint is available to Super Admin, Admin, and clients with delivered/complete projects.

**Impact:** A consultant has no way to verify the final delivered document matches what they signed off on. If the PBDR conversion produces an error or formatting issue, the consultant cannot catch it — only a client or admin-tier user would notice.

---



### GAP 4 — Super Admin and Admin have no availability state (structural inconsistency)

**Severity:** Low
**Missing for:** Super Admin, Admin
**Peers that have it:** Consultant

The `setOwnAvailability()` action in `lib/actions/consultant.ts` is consultant-only. Super Admin and Admin can update any consultant's availability via `setConsultantAvailability()` but cannot set their own.

**Impact:** Likely intentional since neither role is a bookable resource, but structurally inconsistent. If a Super Admin or Admin ever doubles as a consultant, there is no mechanism to reflect that.

---



## Notification types by role


| Notification type                                          | Super Admin | Admin | Consultant | Client |
| ---------------------------------------------------------- | ----------- | ----- | ---------- | ------ |
| `assignment_required` — unassigned project needs attention | ✓           | ✓     | —          | —      |
| `consultant_assigned` — project assigned to consultant     | —           | —     | ✓          | —      |
| `project_submitted` — submission confirmation              | —           | —     | —          | ✓      |
| `project_dispatched` — sent to stakeholders                | —           | —     | —          | ✓      |
| `approval_request` — stakeholder approval needed           | ✓           | ✓     | ✓          | —      |
| `modifications_requested` — stakeholder rejected           | ✓           | ✓     | ✓          | ✓      |
| `project_approved` — all stakeholders approved             | —           | —     | —          | ✓      |
| `pbdr_delivery` — report ready for download                | —           | —     | —          | ✓      |
| `payment_override` — credit gate overridden                | ✓           | —     | —          | —      |
| `low_credit` / `insufficient_credit` — payment warnings    | —           | —     | —          | ✓      |
| `system_error` — system failure                            | ✓           | ✓     | —          | —      |


---



## Database-level access (RLS policies)


| Table / resource          | Super Admin            | Admin                                    | Consultant                 | Client                       |
| ------------------------- | ---------------------- | ---------------------------------------- | -------------------------- | ---------------------------- |
| `projects`                | ALL                    | ALL                                      | SELECT (assigned)          | SELECT (own org)             |
| `users`                   | SELECT (all)           | SELECT (consultant/client only)          | SELECT (own record)        | SELECT (own record)          |
| `organisations`           | ALL (via service role) | UPDATE (existing orgs, via service role) | —                          | SELECT (own org)             |
| `templates`               | ALL                    | ALL                                      | —                          | —                            |
| `template_field_mappings` | ALL                    | ALL                                      | —                          | —                            |
| `stakeholders`            | ALL                    | ALL                                      | —                          | —                            |
| `stakeholder_reviews`     | ALL                    | ALL                                      | SELECT (assigned projects) | —                            |
| `notifications`           | SELECT/UPDATE (own)    | SELECT/UPDATE (own)                      | SELECT/UPDATE (own)        | SELECT/UPDATE (own)          |
| `audit_log`               | SELECT                 | —                                        | —                          | —                            |
| `credit_ledger`           | SELECT                 | SELECT                                   | —                          | —                            |
| `submissions` bucket      | SELECT (all)           | SELECT (all)                             | —                          | INSERT/SELECT (own org path) |


> Writes to `audit_log` and `credit_ledger` are service-role only. No role can UPDATE or DELETE these tables — they are immutable audit trails.

