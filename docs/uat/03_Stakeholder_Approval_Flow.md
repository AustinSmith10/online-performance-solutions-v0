# 03 — Stakeholder: Approval Flow

**Role:** Stakeholder — Sarah Whitmore (`stakeholder@ops.test`)

Covers both projects from file 02, once each is dispatched and shows under **Needs your review**.

## Steps

1. **My Reports** → **Needs your review** → open the direct-submission project.
2. "Please review the brief" — **Download brief** to see the generated .docx, then choose **Approve** ("I approve this brief as submitted."). Submit.
3. Open the email-queue project's review instead, and this time choose **Request changes** ("I need changes before I can approve.") — add a comment in **Comments (optional)** — Submit. This deliberately sends this one into a revision cycle so file 04 has something to finalise.

## Expect

- Direct-submission project: one of its two required approvals is now logged (see file 04 for the note on the second, third-party approver).
- Email-queue project: status flips to **Revising** (stakeholder pill) / **Revision Required** (admin/consultant pill), and the comment you entered appears back on the consultant side.

## Note

Every dispatched project needs approval from **all** assigned reviewers, not just you. The other reviewer on these test projects is typically a third-party certifier who normally responds via an emailed token link — since outbound email is off for this UAT round, that leg isn't testable through the real link (see file 04 for how the consultant covers it).
