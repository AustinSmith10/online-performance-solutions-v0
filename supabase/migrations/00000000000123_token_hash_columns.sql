-- Issue #134: Security — add token_hash columns + backfill for
-- stakeholder/clarification tokens.
--
-- stakeholder_reviews.token and inbound_email_queue.clarification_token are
-- currently stored and compared as plaintext. This is the additive,
-- zero-risk first step: add sha256 hash columns and backfill them from the
-- plaintext values already in the database. No read/write behaviour changes
-- here — application code still uses the plaintext columns. A follow-up
-- issue switches lookups/writes over to the hash and eventually drops the
-- plaintext columns.
--
-- Uses Postgres 17's native sha256(bytea) — no pgcrypto extension needed.
--
-- Index note: this repo's migrations don't have a precedent for
-- CREATE INDEX CONCURRENTLY (see e.g. stakeholder_reviews_token_idx in
-- 00000000000029, inbound_email_queue_clarification_token_idx in
-- 00000000000091 — both plain CREATE INDEX), and CONCURRENTLY cannot run
-- inside a transaction block, which is how this repo's migrations are
-- applied. Both tables are low-volume (per-review/per-inbound-email rows,
-- not request-path hot tables), so a brief lock during index build is
-- acceptable and we keep the plain, transactional form used everywhere else.

ALTER TABLE stakeholder_reviews ADD COLUMN token_hash text;
ALTER TABLE inbound_email_queue ADD COLUMN clarification_token_hash text;

UPDATE stakeholder_reviews
   SET token_hash = encode(sha256(token::bytea), 'hex')
 WHERE token IS NOT NULL;

UPDATE inbound_email_queue
   SET clarification_token_hash = encode(sha256(clarification_token::bytea), 'hex')
 WHERE clarification_token IS NOT NULL;

-- Verification: fail the migration if any non-null plaintext token didn't
-- get a matching hash, making the acceptance criterion self-enforcing
-- rather than just documented.
DO $$
DECLARE
  missing_stakeholder_review_hashes int;
  missing_clarification_hashes     int;
BEGIN
  SELECT count(*) INTO missing_stakeholder_review_hashes
    FROM stakeholder_reviews
   WHERE token IS NOT NULL AND token_hash IS NULL;

  IF missing_stakeholder_review_hashes > 0 THEN
    RAISE EXCEPTION
      'stakeholder_reviews: % row(s) with a non-null token have no token_hash after backfill',
      missing_stakeholder_review_hashes;
  END IF;

  SELECT count(*) INTO missing_clarification_hashes
    FROM inbound_email_queue
   WHERE clarification_token IS NOT NULL AND clarification_token_hash IS NULL;

  IF missing_clarification_hashes > 0 THEN
    RAISE EXCEPTION
      'inbound_email_queue: % row(s) with a non-null clarification_token have no clarification_token_hash after backfill',
      missing_clarification_hashes;
  END IF;
END $$;

-- Unique indexes mirroring the existing constraints on the plaintext columns
-- (stakeholder_reviews_token_key, inbound_email_queue_clarification_token_key).
-- Plaintext token is NOT NULL + UNIQUE, so token_hash is unique over all rows.
CREATE UNIQUE INDEX stakeholder_reviews_token_hash_key ON stakeholder_reviews(token_hash);

-- Plaintext clarification_token is nullable + UNIQUE; a plain unique index
-- likewise treats multiple NULLs as distinct, so this mirrors it exactly.
CREATE UNIQUE INDEX inbound_email_queue_clarification_token_hash_key ON inbound_email_queue(clarification_token_hash);
