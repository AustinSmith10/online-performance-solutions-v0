# Pre-launch checklist

Items to complete before going live. Not blocking development.

## Supabase

- [ ] **Enable leaked password protection** — Auth → Settings → "Enable leaked password protection". Checks new passwords against HaveIBeenPwned.org. One-click toggle.

## Security

- [ ] Rotate all keys and secrets — generate fresh `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, etc. for production. Do not reuse dev credentials.
- [ ] Set `NEXT_PUBLIC_APP_URL` to the production domain in Railway environment variables.
- [ ] Confirm `NODE_ENV=production` is set in Railway — this re-enables 2FA enforcement in the proxy.

## Email

- [ ] Configure a verified sending domain in Resend for production invite and notification emails.
- [ ] Test the invite email flow end-to-end with a real inbox.

## Infrastructure

- [ ] Set up a custom domain and SSL in Railway.
- [ ] Review Railway resource limits and set appropriate memory/CPU for the Next.js and worker services.
