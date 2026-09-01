# Runbook — re-dispatch the projects stranded by the 2026-08 outage (#168)

**Type:** human, do-once, run **after** the #168 code ships to production.
**Prereq:** migrations `123`–`131` applied to production (123–127 were applied
2026-08-31; 128–131 ship with this work).

## Background

During the outage, `dispatchPbdb` ran ~5 un-transacted, un-`.error`-checked
writes. When the per-stakeholder `stakeholder_reviews` upsert failed on the
missing `token_hash` column, the loop finished silently: the project still
flipped to `dispatched` and emails still sent, but **no review rows were
created**. The portal then shows the stakeholder "nothing needs you", and
the certifier's `/approve/[token]` links are dead.

The #168 code makes dispatch transactional and teaches the "Dispatch to
stakeholders" button to recognise `dispatched` / `revision_required` + zero
current-cycle rows as **re-dispatchable**. This runbook uses that button to
heal the projects that were already stranded (they cannot self-heal).

## Affected projects

| project_number | status | cycle | rows present |
|---|---|---|---|
| `222873` | dispatched | 1 | none |
| `223048` | dispatched | 1 | none |
| `221674` | dispatched | 1 | none |
| `221132` | dispatched | 1 | none |
| `221009` | dispatched | 1 | none |
| `222994` | dispatched | 1 | none |
| `221938` | dispatched | 1 | none |
| `145265` | dispatched | 1 | none |
| `567899` | revision_required | 2 | only cycle-1 rows |

(9 projects. Confirm the list against production before starting — run the
verification query below with the `WHERE` clause dropped.)

## Pre-check (read-only)

```sql
select p.project_number, p.status, p.review_cycle,
       count(sr.id) filter (where sr.review_cycle = p.review_cycle) as current_cycle_rows
from projects p
left join stakeholder_reviews sr on sr.project_id = p.id
where p.project_number in
  ('222873','223048','221674','221132','221009','222994','221938','145265','567899')
group by p.id
order by p.project_number;
```

Every row should show `current_cycle_rows = 0`.

## Steps (per project)

1. Open the project in the admin app (`/admin/projects/<id>`), or the
   consultant workspace if you're the assigned consultant.
2. The focus card now reads **"Ready to redispatch"** (not "Awaiting
   stakeholder review"). If it still says the project is not ready, stop —
   the #168 code isn't live yet.
3. Confirm the stakeholder roster on the card is correct (template roster +
   any project extras + the submitting client).
4. Pick the delivery timing. **Expedited** (now the default) sends
   immediately.
5. Click **Dispatch to stakeholders** → **Confirm**.
6. The dispatch is now transactional: if the review-row count doesn't match
   the roster it returns an error and rolls back — you'll see the error, not
   a false success.

## Post-check (per project, and again in aggregate)

Re-run the pre-check query. Every project should now show
`current_cycle_rows` equal to its roster size (≥ 1), and `567899` should
have cycle-2 rows.

Then, as the submitting stakeholder for at least a spot-check of the
projects, confirm the portal shows **Approve / Request changes** (not "you're
all caught up" and not the new "your review hasn't been set up" state from
#169).

## Rollback

None required — re-dispatch is idempotent per cycle (the RPC upserts on
`project_id,review_cycle,stakeholder_email`). Re-running a project that
already healed just refreshes tokens/expiry.

## Sign-off

- [ ] Pre-check confirms 9 stranded projects
- [ ] All 9 re-dispatched via the UI without error
- [ ] Post-check: every project has current-cycle rows matching its roster
- [ ] Spot-check: submitting stakeholder sees Approve / Request changes
- [ ] `#166` / `#168` updated with completion date
