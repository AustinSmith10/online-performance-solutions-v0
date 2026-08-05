import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase/admin");
vi.mock("@/lib/auth/session");
vi.mock("@/lib/documents/generator", () => ({ generatePbdb: vi.fn().mockResolvedValue(undefined) }));

import { generatePbdbForProject } from "./projects";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { generatePbdb } from "@/lib/documents/generator";

const PROJECT_ID = "proj-1";

function chain(data: unknown, count: number | null = null) {
  const obj: Record<string, unknown> = {};
  const resolve = () => Promise.resolve({ data, error: null, count });
  const self = () => obj;
  obj.select = self; obj.eq = self; obj.is = self; obj.limit = self;
  obj.maybeSingle = resolve;
  obj.then = (fn: (v: unknown) => unknown) => resolve().then(fn);
  return obj;
}

function buildMock(unacknowledgedCount: number) {
  const project = { id: PROJECT_ID, client_id: "org-1", project_number: "OPS-1", status: "in_progress" };
  let fieldFlagsCall = 0;
  const from = vi.fn((table: string) => {
    if (table === "projects") return chain(project);
    if (table === "field_flags") {
      fieldFlagsCall++;
      return chain(null, unacknowledgedCount);
    }
    if (table === "project_files") return chain([]);
    return chain(null);
  });
  return { from };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireRole).mockResolvedValue({ id: "actor-1", role: "consultant", email: "c@x.com" } as never);
});

describe("generatePbdbForProject — flag acknowledgment gate (#114)", () => {
  it("blocks generation while unacknowledged flags remain", async () => {
    vi.mocked(createAdminClient).mockReturnValue(buildMock(2) as never);

    const result = await generatePbdbForProject(PROJECT_ID, "/ops/projects", {}, new FormData());

    expect(result.error).toMatch(/acknowledge all flagged fields/i);
    expect(generatePbdb).not.toHaveBeenCalled();
  });

  it("proceeds once every flag is acknowledged", async () => {
    vi.mocked(createAdminClient).mockReturnValue(buildMock(0) as never);

    await generatePbdbForProject(PROJECT_ID, "/ops/projects", {}, new FormData()).catch(() => {});

    expect(generatePbdb).toHaveBeenCalled();
  });
});
