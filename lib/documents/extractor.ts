import "server-only";
import { createRequire } from "module";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (buf: Buffer) => Promise<{ text: string }>;

export type Confidence = "high" | "medium" | "low";

export interface ExtractedField {
  value: string;
  confidence: Confidence;
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
    .map((t) => `  "${t.token}": { "value": "...", "confidence": "high|medium|low" }`)
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

// One document's extraction call result — po_number + one value per token,
// before merging across documents into candidates.
interface SingleDocResult {
  po_number: ExtractedField;
  fields: Record<string, ExtractedField>;
}

function parseJson(raw: string, tokenNames: string[]): SingleDocResult {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON object in response");
  const parsed = JSON.parse(match[0]) as Record<string, unknown>;

  const fields: Record<string, ExtractedField> = {};
  for (const token of tokenNames) {
    fields[token] = asExtractedField(parsed[token]);
  }

  return { po_number: asExtractedField(parsed.po_number), fields };
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const data = await pdfParse(buffer);
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
    fields: Object.fromEntries(tokenNames.map((t) => [t, { ...EMPTY_FIELD }])),
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
  };

  if (documents.length === 0) return emptyResult;

  const perDocResults = await Promise.all(
    documents.map(async (doc) => {
      const text = await extractPdfText(doc.buffer);
      const prompt = buildPrompt([{ label: doc.label, text }], extractTokens);
      return { label: doc.label, result: await runSingleExtraction(prompt, tokenNames) };
    })
  );

  const candidates: Record<string, ExtractedCandidate[]> = Object.fromEntries(
    tokenNames.map((t) => [t, []])
  );
  for (const { label, result } of perDocResults) {
    for (const token of tokenNames) {
      const f = result.fields[token];
      if (f && f.value.trim()) {
        candidates[token].push({ ...f, source_document: label });
      }
    }
  }

  const fields: Record<string, ExtractedField> = {};
  for (const token of tokenNames) {
    fields[token] = pickBest(candidates[token]) ?? { ...EMPTY_FIELD };
  }

  const poCandidates = perDocResults
    .map((r) => r.result.po_number)
    .filter((f) => f.value.trim());
  const po_number = pickBest(poCandidates) ?? { ...EMPTY_FIELD };

  return { po_number, fields, candidates };
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
