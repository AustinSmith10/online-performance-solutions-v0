import "server-only";

// In-memory, per-process bytes-served tracker for in-flight downloads (#125).
// Deliberately not persisted anywhere — a status poll landing on a different
// process instance than the one streaming the file simply sees "unknown"
// (no entry), which the client treats the same as "no progress data yet".
// Entries are cleaned up on completion (short-lived) or after TTL_MS if a
// download is abandoned mid-stream.

export interface DownloadProgress {
  bytesServed: number;
  totalBytes: number | null;
  done: boolean;
}

const TTL_MS = 5 * 60 * 1000;

const store = new Map<string, DownloadProgress>();
const cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleCleanup(id: string, delayMs: number) {
  const existing = cleanupTimers.get(id);
  if (existing) clearTimeout(existing);
  cleanupTimers.set(
    id,
    setTimeout(() => {
      store.delete(id);
      cleanupTimers.delete(id);
    }, delayMs)
  );
}

export function startDownloadProgress(id: string, totalBytes: number | null): void {
  store.set(id, { bytesServed: 0, totalBytes, done: false });
  scheduleCleanup(id, TTL_MS);
}

export function updateDownloadProgress(id: string, bytesServed: number): void {
  const entry = store.get(id);
  if (!entry) return;
  entry.bytesServed = bytesServed;
}

export function completeDownloadProgress(id: string): void {
  const entry = store.get(id);
  if (!entry) return;
  entry.done = true;
  if (entry.totalBytes !== null) entry.bytesServed = entry.totalBytes;
  // Keep the completed entry around briefly so a poll landing right after
  // completion still sees "done: true" instead of a 404.
  scheduleCleanup(id, 30 * 1000);
}

export function getDownloadProgress(id: string): DownloadProgress | null {
  return store.get(id) ?? null;
}
