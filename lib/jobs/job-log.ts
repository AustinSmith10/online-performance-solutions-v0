/**
 * Runs a heavy document job and logs one structured line with its id,
 * duration and outcome (#184) — so a "spinner never cleared" report can be
 * checked against what the job actually did and how long it took.
 *
 * `isFailure` lets result-returning pipelines (deliverPbdr's
 * `{ success: false }`) count as failures without throwing. Thrown errors
 * are logged and rethrown unchanged.
 */
export async function runLoggedJob<T>(
  kind: "generate-pbdb" | "pbdr-conversion" | "pbdr-preview",
  meta: { jobId: string; projectId: string },
  fn: () => Promise<T>,
  isFailure: (result: T) => boolean = () => false
): Promise<T> {
  const started = Date.now();
  const line = (outcome: string, extra = "") =>
    `[job] kind=${kind} job=${meta.jobId} project=${meta.projectId} outcome=${outcome} duration_ms=${Date.now() - started}${extra}`;
  try {
    const result = await fn();
    if (isFailure(result)) console.error(line("failure"));
    else console.log(line("success"));
    return result;
  } catch (err) {
    console.error(line("failure", ` error=${JSON.stringify(err instanceof Error ? err.message : String(err))}`));
    throw err;
  }
}
