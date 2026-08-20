/**
 * Golden-set check for lib/documents/extractor.ts (#154).
 *
 * Not run on every commit — this is a manual pre-model-change check. Run it
 * before pinning a new Anthropic model snapshot (or after any change to
 * buildPrompt / buildExtractionSchema) to catch a regression in extraction
 * quality before it ships.
 *
 * Usage:
 *   node --conditions=react-server --env-file=.env.local --import tsx scripts/golden-set-extraction.ts
 *   node --conditions=react-server --env-file=.env.local --import tsx scripts/golden-set-extraction.ts --verbose
 *
 * The --conditions=react-server flag is required: extractor.ts imports the
 * "server-only" marker package, which throws under a plain Node/tsx run
 * unless that export condition is set (Next's server bundler sets it
 * implicitly; a standalone script has to do it explicitly).
 *
 * Requires ANTHROPIC_API_KEY in the environment — it makes real API calls.
 *
 * ── Populating the fixture set ──────────────────────────────────────────
 * FIXTURES below ships with two placeholder/synthetic entries so the script
 * is runnable end to end with no setup. For a real pre-model-change check,
 * replace them with 20-30 anonymized real documents:
 *
 *   1. Pick a representative spread of real submitted documents (POs,
 *      construction issue plans, subdivision plans, etc.) covering the
 *      token set your templates actually use.
 *   2. Anonymize: strip or replace anything identifying a real client,
 *      site, or person (names, exact addresses if sensitive, PO numbers
 *      tied to a real account) — keep the *shape* of the data (formatting
 *      quirks, layout, title-block structure) that makes it a useful test.
 *   3. Save each as a PDF under scripts/__fixtures__/golden-set/, and add a
 *      FIXTURES entry pointing to it with the expected value per token.
 *   4. Only assert fields you're confident a human reviewer would extract
 *      the same way — leave a token's `expected` out of a case entirely
 *      (rather than guessing) if the source document is genuinely
 *      ambiguous on that field.
 *
 * Each fixture is scored independently. A fixture "passes" when every
 * asserted token's extracted value matches (case-insensitive, trimmed).
 * The script exits non-zero if any fixture fails, so it can also be wired
 * into a manual CI job later if desired.
 */
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { extractSingleDocument, type ExtractToken } from "@/lib/documents/extractor";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VERBOSE = process.argv.includes("--verbose");

const TOKENS: ExtractToken[] = [
  { token: "EXTRACT_ADDRESS", label: "Address", hint: "full street address" },
  { token: "EXTRACT_LOT_NO", label: "Lot number", hint: "e.g. 'Lot 42'" },
];

interface GoldenFixture {
  id: string;
  // Path relative to scripts/__fixtures__/golden-set/, or a function that
  // returns a Buffer directly — the synthetic placeholders below use a tiny
  // real PDF fixture already checked in for the extractor unit tests so the
  // script has something runnable without any setup.
  pdfPath: string;
  expected: Partial<Record<string, string>>;
}

// Placeholder/synthetic fixtures — replace with real anonymized documents
// per the instructions above. Both point at the same minimal valid PDF
// already used by lib/documents/extractor.test.ts, so `expected` here is
// deliberately empty (that fixture PDF has no real extractable content) —
// it exists only to prove the harness runs end to end, not to assert real
// extraction quality.
const FIXTURES: GoldenFixture[] = [
  {
    id: "placeholder-01-empty-po",
    pdfPath: join(__dirname, "..", "lib", "documents", "__fixtures__", "valid-sample.pdf"),
    expected: {},
  },
  {
    id: "placeholder-02-empty-po",
    pdfPath: join(__dirname, "..", "lib", "documents", "__fixtures__", "valid-sample.pdf"),
    expected: {},
  },
];

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

async function main() {
  if (FIXTURES.length < 20) {
    console.warn(
      `⚠ Only ${FIXTURES.length} fixture(s) loaded — this is the shipped placeholder set. ` +
        `Populate scripts/__fixtures__/golden-set/ with 20-30 real anonymized documents ` +
        `for a meaningful pre-model-change check (see the header comment in this file).\n`
    );
  }

  let passCount = 0;
  let failCount = 0;

  for (const fixture of FIXTURES) {
    if (!existsSync(fixture.pdfPath)) {
      console.error(`✗ ${fixture.id}: fixture file not found at ${fixture.pdfPath}`);
      failCount++;
      continue;
    }

    const buffer = readFileSync(fixture.pdfPath);
    const { result } = await extractSingleDocument({ label: fixture.id, buffer }, TOKENS);

    const mismatches: string[] = [];
    for (const [token, expectedValue] of Object.entries(fixture.expected)) {
      if (expectedValue === undefined) continue;
      const candidates = result.fields[token] ?? [];
      const matched = candidates.some((c) => normalize(c.value) === normalize(expectedValue));
      if (!matched) {
        mismatches.push(
          `${token}: expected "${expectedValue}", got [${candidates.map((c) => `"${c.value}"`).join(", ")}]`
        );
      }
    }

    if (mismatches.length === 0) {
      passCount++;
      if (VERBOSE) console.log(`✓ ${fixture.id}`);
    } else {
      failCount++;
      console.error(`✗ ${fixture.id}`);
      for (const m of mismatches) console.error(`    ${m}`);
    }
  }

  console.log(`\n${passCount}/${FIXTURES.length} fixtures passed.`);
  if (failCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("[golden-set-extraction] fatal error:", err);
  process.exitCode = 1;
});
