export type Rates = { input: number; output: number };
export type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
};
export type Charge = {
  page: number;
  pass: "extraction" | "verification";
  model: string;
  timestamp: string;
  usage: Usage | null;
  rates: Rates | null;
  costUsd: number | null;
};
export const PRICING_URL =
  "https://platform.claude.com/docs/en/about-claude/pricing";
// Standard direct API pricing, verified 2026-09-28. No caching is requested by this app.
export function defaultRates(model: string): Rates | null {
  return model === "claude-sonnet-5" ? { input: 2, output: 10 } : null;
}
export function validRate(value: string) {
  return (
    value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) >= 0
  );
}
export function estimate(
  usage: Usage | null,
  rates: Rates | null,
): number | null {
  if (
    !usage ||
    !rates ||
    ![usage.input_tokens, usage.output_tokens, rates.input, rates.output].every(
      (n) => typeof n === "number" && Number.isFinite(n) && n >= 0,
    )
  )
    return null;
  // Unexpected cached usage must not silently be priced as ordinary input.
  if (usage.cache_creation_input_tokens || usage.cache_read_input_tokens)
    return null;
  return (
    (usage.input_tokens * rates.input + usage.output_tokens * rates.output) /
    1_000_000
  );
}
export function summarize(charges: Charge[]) {
  return {
    costUsd: charges.reduce((s, c) => s + (c.costUsd ?? 0), 0),
    calls: charges.length,
    unknownCalls: charges.filter((c) => c.costUsd === null).length,
    inputTokens: charges.reduce((s, c) => s + (c.usage?.input_tokens || 0), 0),
    outputTokens: charges.reduce(
      (s, c) => s + (c.usage?.output_tokens || 0),
      0,
    ),
  };
}
export function money(value: number) {
  return `$${value.toFixed(6)}`;
}
export function costLabel(charges: Charge[]) {
  const s = summarize(charges);
  if (s.calls && s.unknownCalls === s.calls) return "Unavailable";
  return money(s.costUsd) + (s.unknownCalls ? " + unknown" : "");
}
