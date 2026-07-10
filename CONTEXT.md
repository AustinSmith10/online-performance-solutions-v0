# Context

Single-context domain reference for this repo. Companion decision records live in `docs/adr/`.

## Glossary

- **Client** — the company/business itself (formerly called "organisation"; table `clients`). E.g. a home-builder company that engages DDEG.

- **Stakeholder (internal)** — a person who works under a Client's business; a portal login user (`users.role = 'stakeholder'`). Submits report requests, tracks progress, and downloads finished reports on behalf of their company.

- **Stakeholder (external / third-party)** — an independent approval reviewer, such as a building certifier. Not part of the Client's business and not a login user. Lives in the `stakeholders` / `stakeholder_reviews` tables and interacts only via tokenised approval links. Their sign-off on the Performance Solution is required for the report to complete.

- **Performance Solution** — the overall engineering report product this system produces and shepherds through drafting, QA, and stakeholder approval.

- **PBDB** — Performance-Based Design Brief: the QA draft of the report, reviewed internally by a consultant before dispatch.

- **PBDR** — Performance-Based Design Report: the final report, produced after stakeholder approval of the PBDB.

### Why "stakeholder" is overloaded

"Stakeholder" is an intentional umbrella term, not a naming bug. It splits into two unrelated concepts that happen to share a name:

- **Internal stakeholder** — a `users.role` value; a login user acting on behalf of a Client.
- **External/third-party stakeholder** — a row in the separate `stakeholders` contacts table; not a login user, has no `users` row, and only touches the system through a tokenised approval link (see `stakeholder_reviews`).

When working on stakeholder-related code or issues, check which sense is meant — the login-user role or the third-party contacts table — before assuming they're the same entity.
