#!/usr/bin/env bash
# Tier A test for #68 (email-reply threading for stakeholder approvals).
# Simulates the Postmark inbound webhook payload directly — no Postmark
# account needed. Mirrors the curl pattern already used for issue #12 in
# docs/QA_PLAN_2.md (test 12-009).
#
# Usage:
#   1. Start the dev server (npm run dev) and local Supabase (npx supabase start).
#   2. Dispatch a test project to at least one stakeholder so a
#      stakeholder_reviews row (and token) exists. Find it with:
#
#      npx supabase status   # confirm local DB port, usually 54322
#      psql "postgresql://postgres:postgres@localhost:54322/postgres" \
#        -c "select id, project_id, stakeholder_email, token, status
#            from stakeholder_reviews order by created_at desc limit 5;"
#
#   3. Run this script:
#        ./scripts/test-stakeholder-email-reply.sh <token> <stakeholder_email> [webhook_url]
#
#      Example (verified sender — replying from the actual stakeholder's email):
#        ./scripts/test-stakeholder-email-reply.sh AbC123... stakeholder@example.com
#
#      Example (unverified sender — replying from a different address):
#        ./scripts/test-stakeholder-email-reply.sh AbC123... someone-else@example.com
#
# What to check after running:
#   - stakeholder_reviews row: email_reply_text, email_reply_received_at,
#     email_reply_sender_verified now populated
#   - project_files: a new evidence row with
#     reference = 'stakeholder_review:<review_id>'
#   - notifications: a new row for the assigned consultant (+ admins) with
#     type = 'stakeholder_replied_by_email'
#   - audit_log: event_type = 'stakeholder.email_reply_received'

set -euo pipefail

TOKEN="${1:?Usage: $0 <token> <sender_email> [webhook_url]}"
SENDER_EMAIL="${2:?Usage: $0 <token> <sender_email> [webhook_url]}"
WEBHOOK_URL="${3:-http://localhost:3000/api/webhooks/email}"

# If POSTMARK_INBOUND_WEBHOOK_USER/PASSWORD are set in your shell, include
# Basic Auth — otherwise the route skips the auth check (dev-only fallback).
AUTH_ARGS=()
if [[ -n "${POSTMARK_INBOUND_WEBHOOK_USER:-}" && -n "${POSTMARK_INBOUND_WEBHOOK_PASSWORD:-}" ]]; then
  AUTH_ARGS=(-u "${POSTMARK_INBOUND_WEBHOOK_USER}:${POSTMARK_INBOUND_WEBHOOK_PASSWORD}")
fi

MESSAGE_ID="test-stakeholder-reply-$(date +%s)"

curl -sS -X POST "$WEBHOOK_URL" \
  ${AUTH_ARGS[@]+"${AUTH_ARGS[@]}"} \
  -H "Content-Type: application/json" \
  -d @- <<JSON | python3 -m json.tool 2>/dev/null || true
{
  "From": "${SENDER_EMAIL}",
  "FromName": "Test Sender",
  "FromFull": { "Email": "${SENDER_EMAIL}", "Name": "Test Sender", "MailboxHash": "${TOKEN}" },
  "To": "ops@inbound.example.com",
  "Subject": "Re: Approval required",
  "TextBody": "Approved on my end, looks good. (sent by test script at $(date -u +%FT%TZ))",
  "HtmlBody": "<p>Approved on my end, looks good.</p>",
  "MailboxHash": "${TOKEN}",
  "MessageID": "${MESSAGE_ID}",
  "Date": "$(date -u +%FT%TZ)",
  "Attachments": []
}
JSON

echo ""
echo "Sent. message_id=${MESSAGE_ID}"
echo "Check the stakeholder_reviews row for token ${TOKEN} in Supabase, plus"
echo "project_files (reference=stakeholder_review:<review_id>), notifications,"
echo "and audit_log (event_type=stakeholder.email_reply_received)."
