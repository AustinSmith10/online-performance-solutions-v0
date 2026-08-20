// worker.ts runs standalone via `tsx` (see tsconfig.worker.json), not through
// Next's bundler — the "react-server" export condition that makes the real
// `server-only` package a no-op on the server never gets applied, so its
// index.js unconditionally throws on import. This stub is aliased in only
// for that process; the Next app itself still resolves the real package.
export {};
