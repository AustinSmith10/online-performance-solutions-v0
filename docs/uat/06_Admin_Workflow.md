# 06 — Admin: Workflow

**Role:** Admin — Ops Admin (`admin@ops.test`)

Run this **after** files 01–05. It's a standalone test of the admin's own "assign a consultant" capability — it doesn't touch either of the two projects from the main flow. It uses one of the 4 spare pre-seeded **Submitted / Unassigned** projects (Site 155, Site 036, Site 352, or Site 338 — pick any one; the other 3 remain available for a future round).

## Steps

1. **Dashboard** (`/admin/dashboard`) → **Action required** → **New Submission** → **Review (4)** to expand.
2. Find your chosen project. Step 1 of its panel: **Set the project number** — enter a number (e.g. `999999`) → **Save**.
3. Step 2 appears: **Assign a consultant** — from the **Assign to** dropdown pick **Test Consultant — Available** → click **Assign**.
4. Confirm the dialog: **"Assign consultant? Assign Test Consultant?"** → **Confirm**.

## Expect

- The project now shows **Assigned** (or **In Progress**, depending on how the pipeline treats it next) with Test Consultant listed as the assigned consultant, and disappears from **Available jobs** on the consultant side.

This is the only step in the whole UAT round that requires the admin role — everything else runs on Consultant + Stakeholder alone.
