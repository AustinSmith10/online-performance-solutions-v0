import "server-only";
import { createRequire } from "module";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

// pdf-parse v1.x is CJS-only. Import the inner file directly to skip its self-test
// (the top-level index.js opens a local test PDF at require()-time, which breaks in Next.js).
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (buf: Buffer) => Promise<{ text: string }>;

export type Confidence = "high" | "medium" | "low";

export interface ExtractedField {
  value: string;
  confidence: Confidence;
}

export interface ExtractionResult {
  po_number: ExtractedField;
  client_address: ExtractedField;
  house_type: ExtractedField;
  site_wd_no: ExtractedField;
  floor_wd_no: ExtractedField;
  roof_wd_no: ExtractedField;
  draw_date: ExtractedField;
  dev_name: ExtractedField;
}

const EMPTY_FIELD: ExtractedField = { value: "", confidence: "low" };

const EMPTY_RESULT: ExtractionResult = {
  po_number: EMPTY_FIELD,
  client_address: EMPTY_FIELD,
  house_type: EMPTY_FIELD,
  site_wd_no: EMPTY_FIELD,
  floor_wd_no: EMPTY_FIELD,
  roof_wd_no: EMPTY_FIELD,
  draw_date: EMPTY_FIELD,
  dev_name: EMPTY_FIELD,
};

function buildPrompt(poText: string, plansText: string): string {
  return `You are a document data extractor for an Australian building compliance system.

Below is text extracted from two documents:

--- PURCHASE ORDER ---
${poText}

--- BUILDING PLANS ---
${plansText}

Extract the following fields and return ONLY a JSON object with exactly this structure (no explanation):

{
  "po_number":      { "value": "...", "confidence": "high|medium|low" },
  "client_address": { "value": "...", "confidence": "high|medium|low" },
  "house_type":     { "value": "...", "confidence": "high|medium|low" },
  "site_wd_no":     { "value": "...", "confidence": "high|medium|low" },
  "floor_wd_no":    { "value": "...", "confidence": "high|medium|low" },
  "roof_wd_no":     { "value": "...", "confidence": "high|medium|low" },
  "draw_date":      { "value": "...", "confidence": "high|medium|low" },
  "dev_name":       { "value": "...", "confidence": "high|medium|low" }
}

Field extraction rules:
- po_number: Look for "PO Number", "Purchase Order No", "PO#", or similar in the PO document.
- client_address: The site or property address — look in both documents. On building plans it is typically labelled "Address:", "Site Address:", "Property Address:", or appears in the title block near the lot/street details. On the PO it may appear as the delivery/site address.
- house_type: Look for the EXACT label "House Type:" in the building plans and return the value that follows it. Common values are "Single Storey", "Double Storey", "Split Level". Do not infer or guess — only use the value found after "House Type:".
- site_wd_no: Working drawing number for the site plan (labelled "WD", "Site Plan", "SP").
- floor_wd_no: Working drawing number for the floor plan.
- roof_wd_no: Working drawing number for the roof plan.
- draw_date: Date printed on the drawings, formatted DD/MM/YYYY.
- dev_name: The Halcyon development name. Must be one of: Halcyon Promenade, Halcyon Edgebrook, Halcyon Vista, Halcyon Dales, Halcyon Serrata, Halcyon Coves, Halcyon Providence, Halcyon Yandina.

Confidence levels:
- high: field clearly and unambiguously present
- medium: present but partially legible, inferred, or oddly formatted
- low: not found or you are guessing

Use "" with "low" confidence if a field cannot be found.`;
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const data = await pdfParse(buffer);
  return (data.text as string).trim();
}

function parseExtractionJson(raw: string): ExtractionResult {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON object in response");
  return JSON.parse(match[0]) as ExtractionResult;
}

async function extractWithOpenAI(prompt: string): Promise<ExtractionResult> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 1024,
    temperature: 0,
    messages: [{ role: "user", content: prompt }],
  });
  const text = response.choices[0]?.message?.content ?? "";
  return parseExtractionJson(text);
}

async function extractWithAnthropic(prompt: string): Promise<ExtractionResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });
  const text = response.content[0]?.type === "text" ? response.content[0].text : "";
  return parseExtractionJson(text);
}

export async function extractDocumentFields(
  poBuffer: Buffer,
  plansBuffer: Buffer
): Promise<ExtractionResult> {
  const [poText, plansText] = await Promise.all([
    extractPdfText(poBuffer),
    extractPdfText(plansBuffer),
  ]);

  const prompt = buildPrompt(poText, plansText);

  if (process.env.OPENAI_API_KEY) {
    try {
      return await extractWithOpenAI(prompt);
    } catch (err) {
      console.error("[extractor] OpenAI extraction failed, falling back to Anthropic:", err);
    }
  }

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return await extractWithAnthropic(prompt);
    } catch (err) {
      console.error("[extractor] Anthropic extraction also failed:", err);
    }
  }

  return EMPTY_RESULT;
}
