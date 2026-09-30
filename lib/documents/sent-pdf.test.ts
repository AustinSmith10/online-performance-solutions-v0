import { describe, it, expect } from "vitest";
import { resolveSentPdf, findSentPbdbFileIds } from "./sent-pdf";

type Row = Record<string, unknown>;
function fakeSupabase(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = (k: string, v: unknown) => ((rows = rows.filter((r) => r[k] === v)), q);
      q.in = (k: string, v: unknown[]) => ((rows = rows.filter((r) => v.includes(r[k]))), q);
      q.limit = () => q;
      q.maybeSingle = async () => ({ data: rows[0] ?? null });
      q.then = (res: (v: { data: Row[] }) => void) => res({ data: rows });
      return q;
    },
  } as never;
}

const pbdb = { id: "f1", project_id: "p1", file_type: "pbdb", storage_path: "a.docx", original_filename: "a.docx", version: 2, review_cycle: 1 };
const pdf = { project_id: "p1", file_type: "pbdb_pdf", storage_path: "a.pdf", original_filename: "a.pdf", version: 2, review_cycle: 1 };

describe("resolveSentPdf", () => {
  it("returns the stored pbdb_pdf of a dispatched cycle", async () => {
    const sb = fakeSupabase({ project_files: [pbdb, pdf], stakeholder_reviews: [{ project_id: "p1", review_cycle: 1 }] });
    expect(await resolveSentPdf(sb, "f1")).toMatchObject({ docType: "pbdb", storagePath: "a.pdf" });
  });

  it("is null for a cycle that was never dispatched (pending PDF is not 'as sent')", async () => {
    const sb = fakeSupabase({ project_files: [pbdb, pdf], stakeholder_reviews: [] });
    expect(await resolveSentPdf(sb, "f1")).toBeNull();
  });

  it("returns a PBDR row itself — it is the delivered PDF", async () => {
    const pbdr = { id: "r1", project_id: "p1", file_type: "pbdr", storage_path: "r.pdf", original_filename: "r.pdf", version: 1, review_cycle: null };
    expect(await resolveSentPdf(fakeSupabase({ project_files: [pbdr] }), "r1")).toMatchObject({ docType: "pbdr", storagePath: "r.pdf" });
  });
});

describe("findSentPbdbFileIds", () => {
  it("marks only dispatched cycles that have a stored PDF, including superseded ones", async () => {
    const sb = fakeSupabase({
      stakeholder_reviews: [{ project_id: "p1", review_cycle: 1 }],
      project_files: [pdf],
    });
    const ids = await findSentPbdbFileIds(sb, "p1", [
      { id: "old", version: 2, review_cycle: 1 },
      { id: "draft", version: 3, review_cycle: 2 },
    ]);
    expect([...ids]).toEqual(["old"]);
  });
});
