import { describe, it, expect, vi } from "vitest";
import { removeProjectStorageFiles } from "./project-files";

const PROJECT_ID = "proj-1";

function buildMock(files: Record<string, unknown>[]) {
  const removeCalls: { bucket: string; paths: string[] }[] = [];

  const supabase = {
    from: (table: string) => {
      expect(table).toBe("project_files");
      return {
        select: () => ({
          eq: () => Promise.resolve({ data: files, error: null }),
        }),
      };
    },
    storage: {
      from: (bucket: string) => ({
        remove: (paths: string[]) => {
          removeCalls.push({ bucket, paths });
          return Promise.resolve({ data: null, error: null });
        },
      }),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  return { supabase, removeCalls };
}

describe("removeProjectStorageFiles", () => {
  it("splits files across submissions and documents buckets by file_type", async () => {
    const { supabase, removeCalls } = buildMock([
      { storage_path: "org/proj-1/po/a.pdf", file_type: "po" },
      { storage_path: "org/proj-1/additional/b.pdf", file_type: "additional" },
      { storage_path: "org/proj-1/pbdb/v1_c.docx", file_type: "pbdb" },
      { storage_path: "org/proj-1/pbdr/d.pdf", file_type: "pbdr" },
    ]);

    await removeProjectStorageFiles(supabase, PROJECT_ID);

    const submissions = removeCalls.find((c) => c.bucket === "submissions");
    const documents = removeCalls.find((c) => c.bucket === "documents");

    expect(submissions?.paths).toEqual(["org/proj-1/po/a.pdf", "org/proj-1/additional/b.pdf"]);
    expect(documents?.paths).toEqual(["org/proj-1/pbdb/v1_c.docx", "org/proj-1/pbdr/d.pdf"]);
  });

  it("is a no-op when the project has no files", async () => {
    const { supabase, removeCalls } = buildMock([]);
    await removeProjectStorageFiles(supabase, PROJECT_ID);
    expect(removeCalls).toHaveLength(0);
  });

  it("does not throw when a bucket removal errors (best-effort)", async () => {
    const { supabase } = buildMock([{ storage_path: "org/proj-1/po/a.pdf", file_type: "po" }]);
    supabase.storage.from = () => ({
      remove: () => Promise.resolve({ data: null, error: { message: "boom" } }),
    });

    await expect(removeProjectStorageFiles(supabase, PROJECT_ID)).resolves.toBeUndefined();
  });
});
