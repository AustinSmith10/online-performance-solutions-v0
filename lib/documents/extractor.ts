import "server-only";
import { createRequire } from "module";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

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

function buildPrompt(
  documents: { label: string; text: string }[],
  tokens: ExtractToken[]
): string {
  const docSections =
    documents.length > 0
      ? documents
          .map((d) => `--- ${d.label.toUpperCase()} ---\n${d.text}`)
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
separate drawing numbers for the same field. Never split one value into multiple pieces, and
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

// ─── Verification pass (extraction-verification-layer-decisions) ───────────
//
// The extractor's own confidence is self-graded and overstates it — real
// mistakes ("House Type" = "SR" / "SPECIAL GABLE" / "MORETONG5") came back
// "high" and sailed through unflagged, because buildFieldFlagPlan only flags
// on cross-document disagreement or an already-low self-grade. This pass is
// an independent second opinion: for every field a single document's own
// extraction call graded "high", judge it again from scratch — using that
// same field's existing extraction hint (no new admin config) plus the
// document's own text (so it catches a well-formed-but-wrong-cell value, not
// just a malformed one) — and downgrade the confidence if the second opinion
// disagrees. "Most-skeptical-voice-wins": the verifier can only ever lower a
// grade, never raise one, and only high-confidence fields are sent (medium/
// low already flag via the existing path, so there's nothing to gain by
// checking them). Runs once per document as a single batched call covering
// every high-confidence field that document contributed, not once per field.

export interface VerificationEntry {
  token: string;
  idx: number;
  hint: string;
  value: string;
}

export interface VerificationResult {
  confidence: Confidence;
  reason: string;
}

// Pure — no I/O. Exported for unit testing. Only fields graded "high" by this
// document's own extraction pass are worth a second opinion — anything
// already medium/low already flags via buildFieldFlagPlan without our help.
export function collectHighConfidenceEntries(
  fields: Record<string, ExtractedField[]>,
  tokens: ExtractToken[]
): VerificationEntry[] {
  const hintByToken = new Map(tokens.map((t) => [t.token, t.hint]));
  const entries: VerificationEntry[] = [];
  for (const [token, list] of Object.entries(fields)) {
    list.forEach((f, idx) => {
      if (f.confidence === "high" && f.value.trim()) {
        entries.push({ token, idx, hint: hintByToken.get(token) ?? "", value: f.value });
      }
    });
  }
  return entries;
}

function buildVerificationPrompt(docText: string, entries: VerificationEntry[]): string {
  const entryLines = entries
    .map(
      (e, i) =>
        `${i}. Extraction rule: ${e.hint || "(no specific rule provided)"}\n   Extracted value: "${e.value}"`
    )
    .join("\n");

  return `You are independently double-checking values a first-pass extractor already pulled from a document, for an Australian building compliance system. The first pass may be confidently wrong — judge each value fresh against the document text and its own extraction rule below; do not assume the first pass was correct just because it was confident.

Document text:
${docText}

Entries to judge:
${entryLines}

For each entry, decide whether the extracted value plausibly and correctly satisfies its extraction rule, as it actually appears in the document text above. Return ONLY a JSON array with exactly one object per entry index, in this shape:
[{ "index": 0, "confidence": "high|medium|low", "reason": "one short sentence if not high, empty string if high" }]

Grade "high" only if you are independently confident the value is correct. Use "medium" if it's plausible but you're unsure, or "low" if it looks wrong, malformed, fused together with another value, or unsupported by the document text.`;
}

// Pure — no I/O. Exported for unit testing.
export function parseVerificationResponse(raw: string, entryCount: number): Map<number, VerificationResult> {
  const results = new Map<number, VerificationResult>();
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return results;

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return results;
  }
  if (!Array.isArray(parsed)) return results;

  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const index = o.index;
    if (typeof index !== "number" || index < 0 || index >= entryCount) continue;
    if (!["high", "medium", "low"].includes(o.confidence as string)) continue;
    results.set(index, {
      confidence: o.confidence as Confidence,
      reason: typeof o.reason === "string" ? o.reason : "",
    });
  }
  return results;
}

// Mutates `fields` in place, downgrading (never raising) confidence —
// "most-skeptical-voice-wins" (#8b: overwrite the grade in place, keep the
// reason string as the trace, so pickBest/buildFieldFlagPlan/reshuffle all
// work unmodified). Pure aside from the mutation — no I/O. Exported for unit
// testing.
export function applyVerificationResults(
  fields: Record<string, ExtractedField[]>,
  entries: VerificationEntry[],
  results: Map<number, VerificationResult>
): void {
  entries.forEach((entry, i) => {
    const result = results.get(i);
    if (!result || result.confidence === "high") return;
    const field = fields[entry.token]?.[entry.idx];
    if (!field) return;
    field.confidence = result.confidence;
    field.reason = result.reason || undefined;
  });
}

// Orchestrates one document's verification pass. Fails open (#6): a broken
// checker must never make things worse than before this feature existed —
// on any error, leave every field's self-graded confidence untouched and log
// loudly, rather than flagging every high-confidence field (which would
// bury reviewers in alarm-fatigue noise on every checker outage).
async function verifyDocumentFields(
  docText: string,
  fields: Record<string, ExtractedField[]>,
  tokens: ExtractToken[]
): Promise<void> {
  const entries = collectHighConfidenceEntries(fields, tokens);
  if (entries.length === 0) return;

  try {
    const raw = await runTextCompletion(buildVerificationPrompt(docText, entries));
    const results = parseVerificationResponse(raw, entries.length);
    applyVerificationResults(fields, entries, results);
  } catch (err) {
    console.error("[extractor] verification pass failed, leaving self-graded confidence:", err);
  }
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
  const data = await pdfParse(buffer, { pagerender: renderPageByLayout });
  return (data.text as string).trim();
}

async function extractWithOpenAI(
  prompt: string,
  tokenNames: string[]
): Promise<SingleDocResult> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 1024,
    temperature: 0,
    messages: [{ role: "user", content: prompt }],
  });
  return parseJson(response.choices[0]?.message?.content ?? "", tokenNames);
}

async function extractWithAnthropic(
  prompt: string,
  tokenNames: string[]
): Promise<SingleDocResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });
  const text = response.content[0]?.type === "text" ? response.content[0].text : "";
  return parseJson(text, tokenNames);
}

async function runSingleExtraction(
  prompt: string,
  tokenNames: string[]
): Promise<SingleDocResult> {
  const empty: SingleDocResult = {
    po_number: { ...EMPTY_FIELD },
    fields: Object.fromEntries(tokenNames.map((t) => [t, [{ ...EMPTY_FIELD }]])),
  };

  if (process.env.OPENAI_API_KEY) {
    try {
      return await extractWithOpenAI(prompt, tokenNames);
    } catch (err) {
      console.error("[extractor] OpenAI failed, falling back to Anthropic:", err);
    }
  }

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return await extractWithAnthropic(prompt, tokenNames);
    } catch (err) {
      console.error("[extractor] Anthropic also failed:", err);
    }
  }

  return empty;
}

// One LLM call per document (#58) — required so each candidate can carry its
// own source_document for the correction UI, rather than one joint call
// producing a single unattributed value per field.
export async function extractDocumentFields(
  documents: ExtractionDocument[],
  extractTokens: ExtractToken[]
): Promise<DynamicExtractionResult> {
  const tokenNames = extractTokens.map((t) => t.token);

  const emptyResult: DynamicExtractionResult = {
    po_number: { ...EMPTY_FIELD },
    fields: Object.fromEntries(tokenNames.map((t) => [t, { ...EMPTY_FIELD }])),
    candidates: Object.fromEntries(tokenNames.map((t) => [t, []])),
    poCandidates: [],
  };

  if (documents.length === 0) return emptyResult;

  const perDocResults = await Promise.all(
    documents.map(async (doc) => {
      const text = await extractPdfText(doc.buffer);
      const prompt = buildPrompt([{ label: doc.label, text }], extractTokens);
      const result = await runSingleExtraction(prompt, tokenNames);
      await verifyDocumentFields(text, result.fields, extractTokens);
      return { label: doc.label, result };
    })
  );

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

// Shared text-completion helper (same provider fallback as extraction) for
// non-extraction AI calls that live alongside this pipeline — e.g. semantic
// candidate-equivalence checks in lib/documents/compare-candidates.ts.
export async function runTextCompletion(prompt: string): Promise<string> {
  if (process.env.OPENAI_API_KEY) {
    try {
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const response = await client.chat.completions.create({
        model: "gpt-4o",
        max_tokens: 512,
        temperature: 0,
        messages: [{ role: "user", content: prompt }],
      });
      return response.choices[0]?.message?.content ?? "";
    } catch (err) {
      console.error("[extractor] runTextCompletion OpenAI failed, falling back to Anthropic:", err);
    }
  }

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const response = await client.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 512,
        messages: [{ role: "user", content: prompt }],
      });
      return response.content[0]?.type === "text" ? response.content[0].text : "";
    } catch (err) {
      console.error("[extractor] runTextCompletion Anthropic also failed:", err);
    }
  }

  return "";
}
