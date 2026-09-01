import "server-only";
import { PgBoss } from "pg-boss";

/**
 * A send-only pg-boss handle for enqueuing jobs from Next server actions /
 * route handlers (#172). The worker process (worker.ts) owns job execution
 * and queue creation; this side only inserts job rows.
 *
 * Cached at module scope: the web dyno is a long-lived Node process, so one
 * small pg pool for the lifetime of the process is the right shape — not a
 * fresh connect/disconnect per enqueue. `start()` is idempotent within one
 * instance via the cached promise.
 */
let bossPromise: Promise<PgBoss> | null = null;

async function getBoss(): Promise<PgBoss> {
  if (!bossPromise) {
    bossPromise = (async () => {
      const boss = new PgBoss({
        connectionString: process.env.DATABASE_URL!,
        max: 3,
        // This process never runs the maintenance/cron loops — the worker does.
        supervise: false,
        schedule: false,
      });
      boss.on("error", (err) => console.error("[queue-client] pg-boss error:", err));
      await boss.start();
      return boss;
    })();
    // If start() rejects, don't cache the failure forever.
    bossPromise.catch(() => {
      bossPromise = null;
    });
  }
  return bossPromise;
}

/** Queue name for heavy document generation — see worker.ts. */
export const GENERATE_PBDB_QUEUE = "generate-pbdb";

/**
 * One heavy-document job per project at a time. Shared conceptually with the
 * PBDR convert / preview paths, which additionally gate on
 * `projects.progress_pct IS NOT NULL` (set by every heavy pipeline) so the
 * three operations are mutually exclusive per project.
 */
export function pbdbJobSingletonKey(projectId: string): string {
  return `pbdb-heavy:${projectId}`;
}

export interface GeneratePbdbJob {
  projectId: string;
  actorId: string;
  isRegenerate: boolean;
}

/**
 * Enqueue a PBDB generation job. Returns the pg-boss job id, or `null` when a
 * job for this project is already queued/active (the queue's `singleton`
 * policy + singletonKey dedups it) — the caller surfaces that as
 * "a document is already being generated for this project".
 */
export async function enqueueGeneratePbdb(job: GeneratePbdbJob): Promise<string | null> {
  const boss = await getBoss();
  return boss.send(GENERATE_PBDB_QUEUE, job, {
    singletonKey: pbdbJobSingletonKey(job.projectId),
    retryLimit: 0,
    expireInSeconds: 600,
  });
}
