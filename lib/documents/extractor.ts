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

export interface ExtractToken {
  token: string;
  label: string;
  hint: string;
}

export interface DynamicExtractionResult {
  po_number: ExtractedField;
  fields: Record<string, ExtractedField>;
}

const EMPTY_FIELD: ExtractedField = { value: "", confidence: "low" };

function buildPrompt(
  poText: string | null,
  plansText: string,
  tokens: ExtractToken[]
): string {
  const poSection = poText
    ? `--- PURCHASE ORDER ---\n${poText}`
    : `--- PURCHASE ORDER ---\n(no purchase order provided)`;

  const tokenLines = tokens
    .map((t) => `  "${t.token}": { "value": "...", "confidence": "high|medium|low" }`)
    .join(",\n");

  const tokenRules = tokens
    .map((t) => `- ${t.token} (${t.label}): ${t.hint}`)
    .join("\n");

  return `You are a document data extractor for an Australian building compliance system.

Below is text extracted from the submitted documents:

${poSection}

--- BUILDING PLANS ---
${plansText}

Extract the following fields and return ONLY a JSON object with exactly this structure (no explanation):

{
  "po_number": { "value": "...", "confidence": "high|medium|low" },
${tokenLines}
}

Field extraction rules:
- po_number: Look for "PO Number", "Purchase Order No", "PO#", or similar in the PO document. If no PO was provided, return "" with "low" confidence.
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

function parseJson(raw: string, tokenNames: string[]): DynamicExtractionResult {
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
): Promise<DynamicExtractionResult> {
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
): Promise<DynamicExtractionResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });
  const text = response.content[0]?.type === "text" ? response.content[0].text : "";
  return parseJson(text, tokenNames);
}

export async function extractDocumentFields(
  poBuffer: Buffer | null,
  plansBuffer: Buffer,
  extractTokens: ExtractToken[]
): Promise<DynamicExtractionResult> {
  const tokenNames = extractTokens.map((t) => t.token);

  const emptyResult: DynamicExtractionResult = {
    po_number: { ...EMPTY_FIELD },
    fields: Object.fromEntries(tokenNames.map((t) => [t, { ...EMPTY_FIELD }])),
  };

  if (extractTokens.length === 0 && !poBuffer) return emptyResult;

  const [poText, plansText] = await Promise.all([
    poBuffer ? extractPdfText(poBuffer) : Promise.resolve(null),
    extractPdfText(plansBuffer),
  ]);

  const prompt = buildPrompt(poText, plansText, extractTokens);

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

  return emptyResult;
}
