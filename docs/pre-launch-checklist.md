# Pre-launch checklist

Items to complete before going live. Not blocking development.

## Supabase

- [ ] **Enable leaked password protection** — Auth → Settings → "Enable leaked password protection". Checks new passwords against HaveIBeenPwned.org. One-click toggle.

## Security

- [ ] Rotate all keys and secrets — generate fresh `SUPABASE_SERVICE_ROLE_KEY`, `POSTMARK_SERVER_TOKEN`, etc. for production. Do not reuse dev credentials.
- [ ] Set `NEXT_PUBLIC_APP_URL` to the production domain in Railway environment variables.
- [ ] Confirm `NODE_ENV=production` is set in Railway — this re-enables 2FA enforcement in the proxy.
- [ ] Set `POSTMARK_INBOUND_WEBHOOK_USER` / `POSTMARK_INBOUND_WEBHOOK_PASSWORD` in Railway, and configure the matching Basic Auth credentials in the inbound webhook URL in the Postmark dashboard (`https://<user>:<password>@yourdomain.com/api/webhooks/email`).

## Email

- [ ] Sign up for Postmark **Pro plan** ($16.50/mo) — required because Basic does not include inbound email processing, which OPS depends on for client intake. Do not downgrade to Basic.
- [ ] Configure a verified sending domain in Postmark for production invite and notification emails.
- [ ] Test the invite email flow end-to-end with a real inbox.

## Infrastructure

- [ ] Set up a custom domain and SSL in Railway.
- [ ] Review Railway resource limits and set appropriate memory/CPU for the Next.js and worker services.
