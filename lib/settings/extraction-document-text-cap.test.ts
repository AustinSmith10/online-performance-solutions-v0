import { describe, it, expect, vi } from "vitest";
import {
  getExtractionDocumentTextCharCap,
  setExtractionDocumentTextCharCap,
  DEFAULT_EXTRACTION_DOCUMENT_TEXT_CHAR_CAP,
} from "./extraction-document-text-cap";

function supabaseWithRow(value: unknown) {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  return {
    upsert,
    client: {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: value ? { value } : null, error: null }),
        upsert,
      })),
    } as never,
  };
}

describe("extraction document text cap", () => {
  it("defaults to 150,000 when unset", async () => {
    expect(await getExtractionDocumentTextCharCap(supabaseWithRow(null).client)).toBe(150_000);
    expect(DEFAULT_EXTRACTION_DOCUMENT_TEXT_CHAR_CAP).toBe(150_000);
  });

  it("returns a stored in-range value", async () => {
    expect(await getExtractionDocumentTextCharCap(supabaseWithRow({ cap: 40_000 }).client)).toBe(40_000);
  });

  it("ignores a stored value above the timeout-safe maximum", async () => {
    expect(await getExtractionDocumentTextCharCap(supabaseWithRow({ cap: 500_000 }).client)).toBe(150_000);
  });

  it("rejects values outside 1,000–150,000 and saves valid ones", async () => {
    const sb = supabaseWithRow(null);
    expect((await setExtractionDocumentTextCharCap(sb.client, 200_000)).error).toBeTruthy();
    expect((await setExtractionDocumentTextCharCap(sb.client, 500)).error).toBeTruthy();
    expect(sb.upsert).not.toHaveBeenCalled();
    expect(await setExtractionDocumentTextCharCap(sb.client, 60_000, "u-1")).toEqual({});
    expect(sb.upsert).toHaveBeenCalledWith(expect.objectContaining({ value: { cap: 60_000 } }));
  });
});
