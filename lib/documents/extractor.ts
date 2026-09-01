import "server-only";
import { createRequire } from "module";
import Anthropic from "@anthropic-ai/sdk";
import { classifyProviderError, reportProviderFailure } from "@/lib/ai/provider-failure";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAiExtractionEnabled } from "@/lib/settings/ai-extraction-enabled";

const require = createRequire(import.meta.url);
type PdfPageProxy = {
  getTextContent: (opts: {
    normalizeWhitespace: boolean;
    disableCombineTextItems: boolean;
  }) => Promise<{ items: { str: string; transform: number[]; width: number }[] }>;
};

const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (
  buf: Buffer,
  options?: { pagerender?: (pageData: PdfPageProxy) => Promise<string> }
) => Promise<{ text: string }>;

export type Confidence = "high" | "medium" | "low";

export interface ExtractedField {
  value: string;
  confidence: Confidence;
  // Set only when the verification pass (below) downgraded this field's
  // self-graded confidence — the one-line reason a reviewer sees as a caption
  // next to the candidate (extraction-verification-layer-decisions #8a).
  // Absent for anything the verifier didn't touch or didn't downgrade.
  reason?: string;
}

// One document's contribution to a field — the raw material for candidate
// comparison (#58). Only non-empty values become candidates.
export interface ExtractedCandidate extends ExtractedField {
  source_document: string;
}

export interface ExtractToken {
  token: string;
  label: string;
  hint: string;
}

export interface DynamicExtractionResult {
  po_number: ExtractedField;
  // Resolved single best value per token (highest-confidence candidate) —
  // kept for callers that only need one usable value (autofill matching,
  // duplicate-address checks, project persistence).
  fields: Record<string, ExtractedField>;
  // Every document's individual contribution per token, for candidate
  // comparison / flag creation. Absent tokens (e.g. metrics-autofill
  // outputs excluded from the AI call) simply have no entry.
  candidates: Record<string, ExtractedCandidate[]>;
  // Every document's individual po_number contribution, source_document
  // pointing back to the ExtractionDocument.label passed in — lets callers
  // suggest which attachment is actually the Purchase Order instead of
  // guessing by arrival order (email-attachment file-type suggestion).
  poCandidates: ExtractedCandidate[];
}

export interface ExtractionDocument {
  label: string;
  buffer: Buffer;
}

function confidenceRank(c: Confidence): number {
  return c === "high" ? 2 : c === "medium" ? 1 : 0;
}

function pickBest<T extends ExtractedField>(candidates: T[]): T | null {
  if (candidates.length === 0) return null;
  return candidates.reduce((best, c) =>
    confidenceRank(c.confidence) > confidenceRank(best.confidence) ? c : best
  );
}

const EMPTY_FIELD: ExtractedField = { value: "", confidence: "low" };

// Bounds worst-case prompt size on unusually large PDFs. Applied to every
// place raw document text enters a prompt in this file. Sized well above the
// largest real documents seen in practice (~91,000 chars) with headroom to
// grow, while still guarding against a pathological huge PDF — Sonnet 5's 1M
// token context window has no trouble with this. Independent of the judge's
// own document-text cap (file-requirement-verification.ts), which is admin-
// configurable rather than a fixed constant.
const DOC_TEXT_CHAR_CAP = 150_000;

// A JSON Schema (draft-2020-12-ish subset both providers' structured-output
// modes accept) plus the name OpenAI's response_format requires. Passed
// through runTextCompletion to force well-formed output at the API layer
// instead of relying solely on regex-scraping free text.
export interface JsonOutputSchema {
  name: string;
  schema: Record<string, unknown>;
}

function buildPrompt(
  documents: { label: string; text: string }[],
  tokens: ExtractToken[]
): string {
  const docSections =
    documents.length > 0
      ? documents
          .map((d) => `--- ${d.label.toUpperCase()} ---\n${d.text.slice(0, DOC_TEXT_CHAR_CAP)}`)
          .join("\n\n")
      : "(no documents provided)";

  const tokenLines = tokens
    .map((t) => `  "${t.token}": [ { "value": "...", "confidence": "high|medium|low" } ]`)
    .join(",\n");

  const tokenRules = tokens
    .map((t) => `- ${t.token} (${t.label}): ${t.hint}`)
    .join("\n");

  const poRule =
    documents.length > 0
      ? `- po_number: Look for "PO Number", "Purchase Order No", "PO#", or similar across all documents. Return "" with "low" confidence if not found.`
      : `- po_number: No documents provided — return "" with "low" confidence.`;

  return `You are a document data extractor for an Australian building compliance system.

Below is text extracted from the submitted documents:

${docSections}

Extract the following fields and return ONLY a JSON object with exactly this structure (no explanation):

{
  "po_number": { "value": "...", "confidence": "high|medium|low" },
${tokenLines}
}

Each field below "po_number" is an array. Almost always return a single-element array. Only
return more than one element if this document itself clearly contains multiple genuinely distinct
values for that field — e.g. a subdivision plan listing several site addresses, or several
separate drawing numbers for the same field (a Construction Issue Plan or PO covering several
lots/projects is a common case). Never merge multiple distinct values into a single string (e.g.
never return "12 Smith St and 45 Jones Rd" or "12 Smith St / 45 Jones Rd" as one value) — each
distinct value must be its own array element. Never split one value into multiple pieces, and
never fabricate extra entries when you are unsure; when in doubt, return one element.

Field extraction rules:
${poRule}
${tokenRules}

Confidence levels:
- high: field clearly and unambiguously present
- medium: present but partially legible, inferred, or oddly formatted
- low: not found or you are guessing

Use "" with "low" confidence if a field cannot be found.`;
}

function asExtractedField(v: unknown): ExtractedField {
  if (v && typeof v === "object" && "value" in (v as object)) {
    const f = v as Record<string, unknown>;
    return {
      value: typeof f.value === "string" ? f.value : "",
      confidence: (["high", "medium", "low"].includes(f.confidence as string)
        ? f.confidence
        : "low") as Confidence,
    };
  }
  return { ...EMPTY_FIELD };
}

// A token's value within one document's response is normally a single-
// element array, but may hold 2+ distinct values when the document itself
// bundles multiple projects (#64) — e.g. a subdivision plan listing several
// addresses. Falls back to treating a bare object as one element for
// resilience against a model that ignores the array instruction.
function asExtractedFieldList(v: unknown): ExtractedField[] {
  const raw = Array.isArray(v) ? v : [v];
  const fields = raw.map(asExtractedField).filter((f) => f.value.trim());
  return fields.length > 0 ? fields : [{ ...EMPTY_FIELD }];
}

// One document's extraction call result — po_number, plus every distinct
// value this document contributed per token, before merging across
// documents into candidates.
export interface SingleDocResult {
  po_number: ExtractedField;
  fields: Record<string, ExtractedField[]>;
}

// Exported for unit testing (#64) — pure parsing, no I/O.
export function parseJson(raw: string, tokenNames: string[]): SingleDocResult {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON object in response");
  const parsed = JSON.parse(match[0]) as Record<string, unknown>;

  const fields: Record<string, ExtractedField[]> = {};
  for (const token of tokenNames) {
    fields[token] = asExtractedFieldList(parsed[token]);
  }

  return { po_number: asExtractedField(parsed.po_number), fields };
}

// pdf-parse's default renderer walks text items in raw PDF content-stream
// order and only inserts a newline when the Y coordinate changes — it never
// inserts a space between items on the same line. Title blocks generated by
// CAD tools often emit all label cells as one group of text objects and all
// value cells as a separate group, so the default renderer interleaves
// unrelated labels/values and glues horizontally-adjacent values together
// with zero separator (e.g. "House Type: MORETON" + "Facade Type: G5"
// becomes "MORETONG5"). Reconstructing lines by geometry (group by Y,
// sort left-to-right by X, space on horizontal gaps) restores the visual
// row order and keeps adjacent-but-distinct values apart.
type PdfTextItem = { str: string; transform: number[]; width: number };

function renderPageByLayout(pageData: PdfPageProxy): Promise<string> {
  const Y_TOLERANCE = 3;
  return pageData
    .getTextContent({ normalizeWhitespace: false, disableCombineTextItems: true })
    .then(({ items }) => {
      const lines: { y: number; items: PdfTextItem[] }[] = [];
      for (const item of items) {
        if (!item.str || !item.str.trim()) continue;
        const y = item.transform[5];
        const line = lines.find((l) => Math.abs(l.y - y) <= Y_TOLERANCE);
        if (line) line.items.push(item);
        else lines.push({ y, items: [item] });
      }
      lines.sort((a, b) => b.y - a.y);
      return lines
        .map((line) => {
          const sorted = [...line.items].sort((a, b) => a.transform[4] - b.transform[4]);
          let out = "";
          let lastEndX: number | null = null;
          for (const item of sorted) {
            const startX = item.transform[4];
            if (lastEndX !== null && startX - lastEndX > 1) out += " ";
            out += item.str;
            lastEndX = startX + item.width;
          }
          return out;
        })
        .join("\n");
    });
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const { text } = await extractPdfTextAndPageCount(buffer);
  return text;
}

/**
 * Shared PDF text + page count extraction, reused by both the field
 * extractor above and the file-requirement verification layer (#113) — the
 * same layout-aware rendering matters for either use, and page count is
 * pdf-parse's own count of pages it walked, at zero extra cost.
 */
export async function extractPdfTextAndPageCount(
  buffer: Buffer
): Promise<{ text: string; pageCount: number }> {
  const data = await pdfParse(buffer, { pagerender: renderPageByLayout });
  return { text: (data.text as string).trim(), pageCount: (data as unknown as { numpages: number }).numpages };
}

// Dynamic per call — the token set varies by template. A single shared
// per-field shape (value + confidence, both required) nested under po_number
// and every token name, mirroring buildPrompt's expected structure exactly.
function buildExtractionSchema(tokenNames: string[]): JsonOutputSchema {
  const fieldItem = {
    type: "object",
    properties: {
      value: { type: "string" },
      confidence: { type: "string", enum: ["high", "medium", "low"] },
    },
    required: ["value", "confidence"],
    additionalProperties: false,
  };
  const properties: Record<string, unknown> = { po_number: fieldItem };
  for (const token of tokenNames) {
    properties[token] = { type: "array", items: fieldItem };
  }
  return {
    name: "document_extraction",
    schema: {
      type: "object",
      properties,
      required: ["po_number", ...tokenNames],
      additionalProperties: false,
    },
  };
}

async function extractWithAnthropic(
  prompt: string,
  tokenNames: string[]
): Promise<SingleDocResult> {
  // 180s — sized for up to 150k chars of input (DOC_TEXT_CHAR_CAP). Do not
  // lower this: a shorter timeout fails silently into an empty extraction
  // result on genuinely large documents rather than a visible error (#139).
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 180_000 });
  const schema = buildExtractionSchema(tokenNames);
  const response = await client.messages.create({
    // Confirmed against GET /v1/models (2026-08-20, #154): "claude-sonnet-5"
    // is currently the only ID Anthropic exposes for this model — there is
    // no dated snapshot variant yet. Re-check the models endpoint and pin
    // to a dated ID once one exists.
    model: "claude-sonnet-5",
    max_tokens: 1024,
    // #174 originally pinned temperature: 0 here for determinism, but Sonnet 5
    // removed the sampling params — sending `temperature` (even 0) is a 400,
    // which fail-open-swallowed every extraction into an empty result. Sonnet 5
    // is already near-deterministic; determinism for the identity-flag issue
    // has to come from the prompt/schema, not a param the model rejects.
    messages: [{ role: "user", content: prompt }],
    output_config: { format: { type: "json_schema", schema: schema.schema } },
  });
  const text = response.content[0]?.type === "text" ? response.content[0].text : "";
  return parseJson(text, tokenNames);
}

// Fail-open wrapper around the app_settings-backed kill switch (#153) — a
// Supabase misconfiguration or outage while reading the toggle must not
// silently disable extraction, so any error here defaults to "enabled"
// rather than propagating. Mirrors the fail-open behavior already used for
// Anthropic call failures elsewhere in this file.
async function isAiExtractionEnabled(): Promise<boolean> {
  try {
    return await getAiExtractionEnabled(createAdminClient());
  } catch (err) {
    console.error("[extractor] AI extraction kill-switch lookup failed, defaulting to enabled:", err);
    return true;
  }
}

async function runSingleExtraction(
  prompt: string,
  tokenNames: string[]
): Promise<SingleDocResult> {
  const empty: SingleDocResult = {
    po_number: { ...EMPTY_FIELD },
    fields: Object.fromEntries(tokenNames.map((t) => [t, [{ ...EMPTY_FIELD }]])),
  };

  // Kill switch (#153) — checked before touching the Anthropic SDK at all.
  // Off short-circuits to the same empty-result fallback used for the
  // no-API-key case, so this is not a new failure mode for callers.
  if (!(await isAiExtractionEnabled())) {
    return empty;
  }

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return await extractWithAnthropic(prompt, tokenNames);
    } catch (err) {
      console.error("[extractor] Anthropic extraction failed:", err);
      const status = classifyProviderError(err);
      if (status) void reportProviderFailure({ provider: "anthropic", status, context: "document extraction", error: err });
      // #174: a genuine call/parse failure (timeout, 5xx, network, bad JSON)
      // must NOT be swallowed into an all-empty result — the submitter can't
      // tell that apart from "the document genuinely has nothing", and it
      // silently breaks the cross-document address check. Re-throw so the
      // upload pipeline marks extraction_status = "failed" and the UI shows
      // the retry / replace / support guidance (#177). Deliberate empties
      // (kill switch off, no API key) still return `empty` below.
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  return empty;
}

// One document's extraction call, standalone — callable independently the
// instant a single file is uploaded (#115's per-file pipeline), rather than
// only as part of a full-batch extractDocumentFields() call.
export interface SingleDocExtraction {
  label: string;
  result: SingleDocResult;
}

export async function extractSingleDocument(
  doc: ExtractionDocument,
  extractTokens: ExtractToken[]
): Promise<SingleDocExtraction> {
  const tokenNames = extractTokens.map((t) => t.token);
  const text = await extractPdfText(doc.buffer);
  const prompt = buildPrompt([{ label: doc.label, text }], extractTokens);
  const result = await runSingleExtraction(prompt, tokenNames);
  return { label: doc.label, result };
}

// Cross-document merge — pure, no I/O. Separated from the per-document LLM
// call (#115) so it can run once at Continue-time over already-computed
// per-file results (cached on project_files) with zero further LLM calls,
// and so it's unit-testable with canned inputs.
export function mergeExtractionResults(
  perDocResults: SingleDocExtraction[],
  extractTokens: ExtractToken[]
): DynamicExtractionResult {
  const tokenNames = extractTokens.map((t) => t.token);

  const emptyResult: DynamicExtractionResult = {
    po_number: { ...EMPTY_FIELD },
    fields: Object.fromEntries(tokenNames.map((t) => [t, { ...EMPTY_FIELD }])),
    candidates: Object.fromEntries(tokenNames.map((t) => [t, []])),
    poCandidates: [],
  };

  if (perDocResults.length === 0) return emptyResult;

  const candidates: Record<string, ExtractedCandidate[]> = Object.fromEntries(
    tokenNames.map((t) => [t, []])
  );
  for (const { label, result } of perDocResults) {
    for (const token of tokenNames) {
      for (const f of result.fields[token] ?? []) {
        if (f.value.trim()) {
          candidates[token].push({ ...f, source_document: label });
        }
      }
    }
  }

  const fields: Record<string, ExtractedField> = {};
  for (const token of tokenNames) {
    fields[token] = pickBest(candidates[token]) ?? { ...EMPTY_FIELD };
  }

  const poCandidates: ExtractedCandidate[] = perDocResults
    .map((r) => ({ ...r.result.po_number, source_document: r.label }))
    .filter((f) => f.value.trim());
  const po_number = pickBest(poCandidates) ?? { ...EMPTY_FIELD };

  return { po_number, fields, candidates, poCandidates };
}

// One LLM call per document (#58) — required so each candidate can carry its
// own source_document for the correction UI, rather than one joint call
// producing a single unattributed value per field. Kept as a thin wrapper
// around extractSingleDocument + mergeExtractionResults (#115) for callers
// that still want the full batch-and-merge behavior in one call.
export async function extractDocumentFields(
  documents: ExtractionDocument[],
  extractTokens: ExtractToken[]
): Promise<DynamicExtractionResult> {
  if (documents.length === 0) return mergeExtractionResults([], extractTokens);

  const perDocResults = await Promise.all(
    documents.map((doc) => extractSingleDocument(doc, extractTokens))
  );

  return mergeExtractionResults(perDocResults, extractTokens);
}

// Shared text-completion helper for non-extraction AI calls that live
// alongside this pipeline — the file-requirement AI judge
// (lib/documents/file-requirement-verification.ts), semantic
// candidate-equivalence (lib/documents/compare-candidates.ts), and
// stakeholder email comment extraction (app/actions/stakeholders.ts).
// `context` labels the calling feature for anything reported via
// reportProviderFailure. `outputSchema`, when supplied, forces well-formed
// JSON at the API layer for callers that need structured output; omit it for
// plain-text tasks (e.g. email cleanup).
//
// Haiku — these are all short-output classification/extraction judgments,
// not tasks that need frontier-tier reasoning.
export async function runTextCompletion(
  prompt: string,
  context = "AI text completion",
  outputSchema?: JsonOutputSchema
): Promise<string> {
  // Kill switch (#153) — same fallback shape as the no-API-key path below.
  if (!(await isAiExtractionEnabled())) {
    return "";
  }

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      // 30s — short-output classification/extraction judgments (#139).
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 30_000 });
      const response = await client.messages.create({
        // Pinned to the dated snapshot confirmed via GET /v1/models
        // (2026-08-20, #154).
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        // #174: deterministic judgments — a wrong-type document should get
        // the same verdict on every retry, not flicker between runs. Haiku 4.5
        // (unlike Sonnet 5) still accepts the sampling params, so this stays.
        temperature: 0,
        messages: [{ role: "user", content: prompt }],
        ...(outputSchema
          ? { output_config: { format: { type: "json_schema" as const, schema: outputSchema.schema } } }
          : {}),
      });
      return response.content[0]?.type === "text" ? response.content[0].text : "";
    } catch (err) {
      console.error("[extractor] runTextCompletion Anthropic failed:", err);
      const status = classifyProviderError(err);
      if (status) void reportProviderFailure({ provider: "anthropic", status, context, error: err });
    }
  }

  return "";
}
