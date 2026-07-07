# Email Provider Comparison — Resend vs Postmark vs Both

Context: OPS needs two email capabilities — **outbound transactional** (confirmations, approval requests, PBDR delivery, notifications) and **inbound webhook parsing** (clients emailing the intake address, reply threading onto existing drafts via a mailbox-hash-style identifier). PRD v1.1 currently specifies Resend for outbound and Postmark Inbound for inbound. This doc compares that split against running either vendor alone.

## Option A — Resend only

Resend added inbound receiving in November 2025, so it can now cover both directions.

**How inbound would work:** point the receiving domain's MX at Resend, register a webhook, route by parsing the `to` address (e.g. `drafts+<hash>@inbound.opsdomain.com`) since Resend doesn't have a first-class MailboxHash field — you implement the hash-in-plus-address convention yourself, same as Postmark does under the hood.

**Pros**
- One vendor, one API key, one dashboard, one billing relationship, one DNS setup.
- Already the PRD's chosen outbound sender — React Email templates, existing `lib/email/sender.ts` design, no rework there.
- Simpler mental model: `resend.emails.send()` and one inbound webhook shape to learn instead of two SDKs.

**Cons**
- Inbound is ~8 months old as of this writing (Nov 2025 launch vs today, Jul 2026) — materially less battle-tested than Postmark's decade-plus inbound pipeline, and this is your primary client-intake channel, not a secondary path.
- Inbound webhook payload is metadata-only (sender, subject, message ID, attachment refs). Body and attachments require a **follow-up API call** per email — more latency and more failure surface in the webhook handler than Postmark's single-POST payload.
- No native MailboxHash concept — reply-threading logic (matching an inbound email back to an existing draft) has to be hand-rolled via plus-addressing conventions and tested for edge cases (forwarded emails, clients who strip the `+tag`, mobile mail clients that mangle plus-addresses).
- Smaller install base for inbound specifically means fewer Stack Overflow answers / community fixes when something parses oddly.

**When this makes sense:** if you're comfortable spiking the inbound flow before committing, and value operational simplicity over battle-tested maturity.

## Option B — Postmark only

Postmark is a mature transactional sender in its own right, not just an inbound specialist.

**How outbound would work:** swap `resend.emails.send()` for Postmark's send API (`postmark` npm package). React Email components still work — they just render to HTML/text, which any provider accepts. Templates, retries, and the `notify.ts` unified dispatch layer are unaffected; only the transport wrapper (`lib/email/sender.ts`) changes.

**Pros**
- One vendor for both directions, same simplicity benefit as Option A.
- Inbound stays exactly as scoped in the current PRD (MailboxHash, full body + attachments in a single webhook POST) — zero inbound rework or new risk.
- Postmark's outbound deliverability and reputation tooling (bounce/complaint handling, dedicated message streams for transactional vs broadcast) is generally considered stronger and more enterprise-oriented than Resend's, which matters for approval-cycle emails that must reliably land in stakeholders' inboxes.
- Message-level tracking (opens, link clicks, bounces) is mature and has been stable for years.

**Cons**
- Loses Resend's React Email-native developer experience — Resend is purpose-built around that workflow (though it's a thin wrapper either way; React Email itself is provider-agnostic).
- Slightly more old-school API/SDK ergonomics compared to Resend's newer, TypeScript-first DX.
- Marginally higher cost at low volume in some pricing tiers (worth checking current pricing pages before deciding — both change pricing periodically).

**When this makes sense:** if inbound reliability is the priority (it's the piece with no manual fallback — a lost intake email is a lost job) and you're willing to trade some outbound DX polish for a single, proven vendor.

## Option C — Both (current PRD)

**Pros**
- Each vendor used for what it's best known for: Resend for outbound DX, Postmark for inbound maturity (MailboxHash, single-payload body+attachments).
- No dependency on Resend's newer inbound product; no rework needed today since this is already the PRD design.
- Vendor risk is split — an outage or account issue with one provider doesn't take down both directions.

**Cons**
- Two API keys, two webhook endpoints, two DNS/domain configs (SPF/DKIM for both sending domains, MX for the receiving one), two dashboards to monitor, two vendor relationships/invoices.
- Two failure domains to reason about in incident response — "is it Resend or Postmark?" is one more branch in every email-related debugging session.
- No cross-vendor deliverability signal sharing — bounce/complaint data from outbound (Resend) doesn't inform inbound trust decisions (Postmark), though this is a minor concern for the OPS use case.

## Recommendation

For OPS's actual load (low-volume, business-critical, not mass-market), the operational cost of running two vendors is small in absolute terms but not zero, and inbound is the channel with no manual fallback if something breaks. Given that:

- **If you want to consolidate:** Postmark-only (Option B) is the lower-risk consolidation — it keeps the inbound design exactly as already scoped and proven, and only requires swapping the outbound transport wrapper.
- **If you want to consolidate and prefer Resend's DX:** Resend-only (Option A) is viable but should be preceded by a short spike of the inbound flow (attachment fetch latency, plus-address parsing robustness) before removing Postmark from the architecture.
- **If you'd rather not decide under time pressure:** keep both (Option C, current PRD) — it's already designed, and the "two vendors" cost is mostly setup-time and monitoring surface, not runtime risk.

No option is clearly wrong; this is a complexity-vs-maturity tradeoff, not a correctness issue.
