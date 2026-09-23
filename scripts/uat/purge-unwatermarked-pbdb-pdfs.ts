/**
 * One-off cleanup for #186. Every stakeholder-facing PBDB PDF cached since
 * the #118 regression (6 Aug) was rendered without its "NOT FOR
 * CONSTRUCTION" watermark. #185 fixed rendering, but getOrCreateDispatchPdf
 * reuses a cached `pbdb_pdf` row forever, so those PDFs would keep being
 * served. This deletes the cached rows + storage objects for projects that
 * haven't been delivered; the stakeholder routes (getDispatchPdfForCycle)
 * then regenerate each one — watermarked — on its next view.
 *
 * Only `file_type = 'pbdb_pdf'` is touched: source `pbdb` docx files and
 * delivered `pbdr` files are never selected.
 *
 * Run only once #185 and the #186 on-demand regeneration are deployed —
 * otherwise the regenerated PDFs would still be unwatermarked.
 *
 * Usage (dry run — lists what would be deleted, changes nothing):
 *   npx tsx --tsconfig tsconfig.worker.json --env-file=.env.local scripts/uat/purge-unwatermarked-pbdb-pdfs.ts
 * Apply:
 *   npx tsx --tsconfig tsconfig.worker.json --env-file=.env.local scripts/uat/purge-unwatermarked-pbdb-pdfs.ts --apply
 */
import { createAdminClient } from "@/lib/supabase/admin";

const DELIVERED_STATUSES = ["delivered", "complete"];

const apply = process.argv.includes("--apply");
const supabase = createAdminClient();

async function main() {
  const { data: rows, error } = await supabase
    .from("project_files")
    .select("id, project_id, storage_path, original_filename, review_cycle, version, projects!inner(status, project_number)")
    .eq("file_type", "pbdb_pdf")
    .not("projects.status", "in", `(${DELIVERED_STATUSES.join(",")})`);

  if (error) throw error;
  const targets = rows ?? [];

  console.log(`${targets.length} cached pbdb_pdf row(s) on non-delivered projects:`);
  for (const row of targets) {
    const project = row.projects as unknown as { status: string; project_number: string | null };
    console.log(
      `  ${project.project_number ?? row.project_id} [${project.status}] cycle ${row.review_cycle} v${row.version} — ${row.storage_path}`
    );
  }

  if (!apply) {
    console.log("\nDry run — nothing deleted. Re-run with --apply to delete.");
    return;
  }
  if (targets.length === 0) return;

  // Storage first: getOrCreateDispatchPdf re-uploads to the same path without
  // upsert, so a leftover object would make the regeneration fail.
  const paths = targets.map((r) => r.storage_path as string);
  for (let i = 0; i < paths.length; i += 100) {
    const { error: rmErr } = await supabase.storage.from("documents").remove(paths.slice(i, i + 100));
    if (rmErr) throw new Error(`storage remove failed: ${rmErr.message}`);
  }

  const { error: delErr, count } = await supabase
    .from("project_files")
    .delete({ count: "exact" })
    .in("id", targets.map((r) => r.id as string))
    .eq("file_type", "pbdb_pdf");
  if (delErr) throw new Error(`row delete failed: ${delErr.message}`);

  console.log(`\nDeleted ${paths.length} storage object(s) and ${count ?? 0} pbdb_pdf row(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
