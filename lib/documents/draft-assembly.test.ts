import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { assembleAndPersistDraftFields } from "./draft-assembly";
import type { SingleDocExtraction, ExtractToken } from "./extractor";

const TOKENS: ExtractToken[] = [
  { token: "EXTRACT_ADDRESS", label: "Address", hint: "full street address" },
  { token: "EXTRACT_HOUSE_TYPE", label: "House Type", hint: "single-word style name" },
];

function docResult(overrides: Partial<SingleDocExtraction> = {}): SingleDocExtraction {
  return {
    label: "doc.pdf",
    result: {
      po_number: { value: "", confidence: "low" },
      fields: {
        EXTRACT_ADDRESS: [{ value: "", confidence: "low" }],
        EXTRACT_HOUSE_TYPE: [{ value: "", confidence: "low" }],
      },
    },
    ...overrides,
  };
}

function buildSupabaseMock(
  opts: {
    duplicateByAddress?: { id: string } | null;
    duplicateByDraft?: { id: string } | null;
    updateError?: { message: string } | null;
  } = {}
) {
  const { duplicateByAddress = null, duplicateByDraft = null, updateError = null } = opts;

  const insertedFlagRows: unknown[] = [];
  const updateCalls: { payload: unknown; eqArgs: unknown[] }[] = [];
  const deleteEqCalls: unknown[][] = [];
  const selectCalls: { eqArgs: unknown[][]; neqArgs: unknown[][]; usedFilter: boolean }[] = [];

  const from = vi.fn((table: string) => {
    if (table === "projects") {
      return {
        select: vi.fn(() => {
          const record = { eqArgs: [] as unknown[][], neqArgs: [] as unknown[][], usedFilter: false };
          selectCalls.push(record);
          const builder: {
            eq: ReturnType<typeof vi.fn>;
            neq: ReturnType<typeof vi.fn>;
            is: ReturnType<typeof vi.fn>;
            limit: ReturnType<typeof vi.fn>;
            filter: ReturnType<typeof vi.fn>;
            maybeSingle: ReturnType<typeof vi.fn>;
          } = {
            eq: vi.fn((...args: unknown[]) => {
              record.eqArgs.push(args);
              return builder;
            }),
            neq: vi.fn((...args: unknown[]) => {
              record.neqArgs.push(args);
              return builder;
            }),
            is: vi.fn(() => builder),
            limit: vi.fn(() => builder),
            filter: vi.fn(() => {
              record.usedFilter = true;
              return builder;
            }),
            maybeSingle: vi.fn(() =>
              Promise.resolve({ data: record.usedFilter ? duplicateByDraft : duplicateByAddress, error: null })
            ),
          };
          return builder;
        }),
        update: vi.fn((payload: unknown) => ({
          eq: vi.fn((...eqArgs: unknown[]) => {
            updateCalls.push({ payload, eqArgs });
            return Promise.resolve({ error: updateError });
          }),
        })),
      };
    }
    if (table === "field_flags") {
      return {
        delete: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn((...args: unknown[]) => {
              deleteEqCalls.push(args);
              return Promise.resolve({ error: null });
            }),
          })),
        })),
        insert: vi.fn((rows: unknown[]) => {
          insertedFlagRows.push(...rows);
          return Promise.resolve({ error: null });
        }),
      };
    }
    throw new Error(`Unexpected table in mock: ${table}`);
  });

  return { from, insertedFlagRows, updateCalls, deleteEqCalls, selectCalls };
}

const comparisonModeByToken = new Map<string, "exact">([
  ["EXTRACT_ADDRESS", "exact"],
  ["EXTRACT_HOUSE_TYPE", "exact"],
]);

describe("assembleAndPersistDraftFields — cross-document assembly (#115)", () => {
  it("merges a single file's results and persists them onto the existing draft row", async () => {
    const supabase = buildSupabaseMock();
    const doc = docResult({
      result: {
        po_number: { value: "PO123", confidence: "high" },
        fields: {
          EXTRACT_ADDRESS: [{ value: "12 Smith Street", confidence: "high" }],
          EXTRACT_HOUSE_TYPE: [{ value: "Moreton", confidence: "high" }],
        },
      },
    });

    const result = await assembleAndPersistDraftFields(supabase as never, {
      projectId: "proj-1",
      orgId: "org-1",
      perFileResults: [doc],
      extractTokens: TOKENS,
      comparisonModeByToken,
      metricsAutofillConfigs: [],
    });

    expect(result.error).toBeUndefined();
    expect(result.draftFields.EXTRACT_ADDRESS).toBe("12 Smith Street");
    expect(supabase.updateCalls).toHaveLength(1);
    expect(supabase.updateCalls[0].eqArgs).toEqual(["id", "proj-1"]);
  });

  it("merges multiple files, picking the highest-confidence candidate per field", async () => {
    const supabase = buildSupabaseMock();
    const docA = docResult({
      label: "a.pdf",
      result: {
        po_number: { value: "", confidence: "low" },
        fields: {
          EXTRACT_ADDRESS: [{ value: "12 Smith Street", confidence: "medium" }],
          EXTRACT_HOUSE_TYPE: [{ value: "", confidence: "low" }],
        },
      },
    });
    const docB = docResult({
      label: "b.pdf",
      result: {
        po_number: { value: "", confidence: "low" },
        fields: {
          EXTRACT_ADDRESS: [{ value: "14 Smith Street", confidence: "high" }],
          EXTRACT_HOUSE_TYPE: [{ value: "", confidence: "low" }],
        },
      },
    });

    const result = await assembleAndPersistDraftFields(supabase as never, {
      projectId: "proj-1",
      orgId: "org-1",
      perFileResults: [docA, docB],
      extractTokens: TOKENS,
      comparisonModeByToken,
      metricsAutofillConfigs: [],
    });

    expect(result.draftFields.EXTRACT_ADDRESS).toBe("14 Smith Street");
  });

  it("self-excludes the draft's own row from the duplicate-address check", async () => {
    // The mock's builder returns duplicateByAddress=null whenever .neq() is
    // exercised in the real query — here we simulate "no OTHER project has
    // this address" by leaving duplicateByAddress/duplicateByDraft null, and
    // assert the query actually included .neq("id", projectId).
    const supabase = buildSupabaseMock({ duplicateByAddress: null, duplicateByDraft: null });
    const doc = docResult({
      result: {
        po_number: { value: "", confidence: "low" },
        fields: {
          EXTRACT_ADDRESS: [{ value: "12 Smith Street", confidence: "high" }],
          EXTRACT_HOUSE_TYPE: [{ value: "", confidence: "low" }],
        },
      },
    });

    const result = await assembleAndPersistDraftFields(supabase as never, {
      projectId: "proj-1",
      orgId: "org-1",
      perFileResults: [doc],
      extractTokens: TOKENS,
      comparisonModeByToken,
      metricsAutofillConfigs: [],
    });

    expect(result.error).toBeUndefined();
    // Both duplicate-check sub-queries (by site_address, by draft extracted_fields) must self-exclude.
    for (const call of supabase.selectCalls) {
      expect(call.neqArgs).toContainEqual(["id", "proj-1"]);
    }
  });

  it("flags a genuine duplicate from a different project and does not persist", async () => {
    const supabase = buildSupabaseMock({ duplicateByAddress: { id: "other-project" } });
    const doc = docResult({
      result: {
        po_number: { value: "", confidence: "low" },
        fields: {
          EXTRACT_ADDRESS: [{ value: "12 Smith Street", confidence: "high" }],
          EXTRACT_HOUSE_TYPE: [{ value: "", confidence: "low" }],
        },
      },
    });

    const result = await assembleAndPersistDraftFields(supabase as never, {
      projectId: "proj-1",
      orgId: "org-1",
      perFileResults: [doc],
      extractTokens: TOKENS,
      comparisonModeByToken,
      metricsAutofillConfigs: [],
    });

    expect(result.error).toContain("already exists");
    expect(result.duplicateProjectId).toBe("other-project");
    expect(supabase.updateCalls).toHaveLength(0);
  });

  it("builds a field-flag plan from merged candidates and persists flagged tokens", async () => {
    const supabase = buildSupabaseMock();
    const docA = docResult({
      label: "a.pdf",
      result: {
        po_number: { value: "", confidence: "low" },
        fields: {
          EXTRACT_ADDRESS: [{ value: "12 Smith Street", confidence: "high" }],
          EXTRACT_HOUSE_TYPE: [{ value: "Moreton", confidence: "high" }],
        },
      },
    });
    const docB = docResult({
      label: "b.pdf",
      result: {
        po_number: { value: "", confidence: "low" },
        fields: {
          EXTRACT_ADDRESS: [{ value: "12 Smith Street", confidence: "high" }],
          EXTRACT_HOUSE_TYPE: [{ value: "Ascot", confidence: "high" }],
        },
      },
    });

    const result = await assembleAndPersistDraftFields(supabase as never, {
      projectId: "proj-1",
      orgId: "org-1",
      perFileResults: [docA, docB],
      extractTokens: TOKENS,
      comparisonModeByToken,
      metricsAutofillConfigs: [],
    });

    expect(result.flagPlans.get("EXTRACT_HOUSE_TYPE")?.needsFlag).toBe(true);
    expect(result.flagPlans.get("EXTRACT_ADDRESS")?.needsFlag).toBe(false);
    expect(supabase.insertedFlagRows).toHaveLength(1);
    expect(supabase.insertedFlagRows[0]).toMatchObject({ project_id: "proj-1", field_key: "EXTRACT_HOUSE_TYPE" });
    expect(supabase.deleteEqCalls.length).toBeGreaterThan(0);
  });
});
