import { describe, it, expect, vi } from "vitest";
import {
  getJudgeDocumentTextCharCap,
  setJudgeDocumentTextCharCap,
  DEFAULT_JUDGE_DOCUMENT_TEXT_CHAR_CAP,
  JUDGE_DOCUMENT_TEXT_CHAR_CAP_KEY,
} from "./judge-document-text-cap";

function supabaseWithRow(value: unknown) {
  return {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: value ? { value } : null, error: null }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    })),
  };
}

describe("getJudgeDocumentTextCharCap", () => {
  it("returns the default when no row exists", async () => {
    const supabase = supabaseWithRow(null);
    const cap = await getJudgeDocumentTextCharCap(supabase as never);
    expect(cap).toBe(DEFAULT_JUDGE_DOCUMENT_TEXT_CHAR_CAP);
  });

  it("returns the stored cap when present", async () => {
    const supabase = supabaseWithRow({ cap: 200_000 });
    const cap = await getJudgeDocumentTextCharCap(supabase as never);
    expect(cap).toBe(200_000);
  });

  it("falls back to the default when the stored value is malformed", async () => {
    const supabase = supabaseWithRow({ cap: "a lot" });
    const cap = await getJudgeDocumentTextCharCap(supabase as never);
    expect(cap).toBe(DEFAULT_JUDGE_DOCUMENT_TEXT_CHAR_CAP);
  });

  it("falls back to the default when the stored cap is not positive", async () => {
    const supabase = supabaseWithRow({ cap: 0 });
    const cap = await getJudgeDocumentTextCharCap(supabase as never);
    expect(cap).toBe(DEFAULT_JUDGE_DOCUMENT_TEXT_CHAR_CAP);
  });
});

describe("setJudgeDocumentTextCharCap", () => {
  it("rejects a non-positive value", async () => {
    const supabase = supabaseWithRow(null);
    const result = await setJudgeDocumentTextCharCap(supabase as never, 0);
    expect(result.error).toBeDefined();
  });

  it("rejects a fractional value", async () => {
    const supabase = supabaseWithRow(null);
    const result = await setJudgeDocumentTextCharCap(supabase as never, 1.5);
    expect(result.error).toBeDefined();
  });

  it("upserts a valid cap under the expected key", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const supabase = { from: vi.fn(() => ({ upsert })) };
    const result = await setJudgeDocumentTextCharCap(supabase as never, 200_000, "user-1");
    expect(result.error).toBeUndefined();
    expect(supabase.from).toHaveBeenCalledWith("app_settings");
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        key: JUDGE_DOCUMENT_TEXT_CHAR_CAP_KEY,
        value: { cap: 200_000 },
        updated_by: "user-1",
      })
    );
  });
});
