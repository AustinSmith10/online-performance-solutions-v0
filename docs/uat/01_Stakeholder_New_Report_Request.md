# 01 — Stakeholder: New Report Request

**Role:** Stakeholder — Sarah Whitmore (`stakeholder@ops.test`)

This creates the 1 project that goes through the direct in-app submission path (as opposed to the 1 project that comes in via the email queue — see file 02).

## Steps

1. From **My Reports** (`/portal`), click **New report request**.
2. Attach your documents (floor plan + PO pair — confirm which set to use before running this; not yet decided).
3. Submit.

## Expect

- The new project appears in **My Reports** under **All** / **In progress**, with the stepper on **Submitted** and copy "Your request has been submitted".

## Not yet confirmed live

- The exact submit-form field order/labels for a stakeholder-initiated request (I verified the admin/consultant-side equivalent at `/admin/projects/submit` and `/ops/projects/submit`, which asks for **Client** and **Stakeholder account** — the stakeholder's own `/portal/submit` form wasn't opened during the walkthrough). If the fields differ from what's above, note it as a real finding, not tester error.
