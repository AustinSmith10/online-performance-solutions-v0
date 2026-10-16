// USD per million tokens, from Anthropic's published pricing. Used only for
// the admin usage view's cost *estimate* — update when models or prices
// change. Sonnet 5's own price wasn't published separately when this was
// written, so it is assumed to match Sonnet 5.5.
const PRICE_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
  // Pseudo-model for logged events where the AI call was skipped (e.g. a scan
  // with no readable text): costs nothing, but should appear in the usage view.
  none: { input: 0, output: 0 },
};

/** Estimated USD cost for a model's token counts, or null for an unpriced model. */
export function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number
): number | null {
  const price = PRICE_PER_MTOK[model];
  if (!price) return null;
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}
