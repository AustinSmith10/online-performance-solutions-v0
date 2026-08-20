import { GOTENBERG_URL, HAS_ANTHROPIC_KEY } from "./env";

// Some stages of the "drop everything" journey depend on sidecar services
// this suite doesn't try to fake:
//   - PBDB dispatch and PBDR delivery both convert .docx -> .pdf via a real
//     Gotenberg instance (lib/documents/pdf.ts).
//   - The submission form's AI field extraction calls the real Anthropic API
//     (lib/documents/extractor.ts) when a file requirement has
//     extraction: true.
//
// Rather than mock these out (and risk testing a fake path that diverges
// from production) or fail flakily when they're not configured, tests that
// need them check here first and skip with a clear reason — "no coverage"
// is honest; "flaky" is not.

let gotenbergReachable: boolean | null = null;

export async function isGotenbergReachable(): Promise<boolean> {
  if (gotenbergReachable !== null) return gotenbergReachable;
  try {
    const res = await fetch(`${GOTENBERG_URL}/health`, {
      signal: AbortSignal.timeout(3_000),
    });
    gotenbergReachable = res.ok;
  } catch {
    gotenbergReachable = false;
  }
  return gotenbergReachable;
}

export function hasAnthropicKey(): boolean {
  return HAS_ANTHROPIC_KEY;
}
