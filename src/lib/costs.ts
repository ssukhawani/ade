import type { Provider, PricingKind } from "./models";
import type { CallMetadata } from "./replicate";
export type Rates = { input: number; output: number };
export type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
};
export type Charge = CallMetadata & {
  page: number;
  provider?: Provider;
  pricingKind?: PricingKind;
  unitRate?: number | null;
  pricingSource?: string;
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
    durationMs: charges.reduce((s, c) => s + (c.durationMs || 0), 0),
    timedCalls: charges.filter((c) => c.durationMs !== undefined).length,
    averageSecondsPerAttemptedPage: charges.length
      ? charges.reduce((s, c) => s + (c.durationMs || 0), 0) /
        1000 /
        new Set(charges.map((c) => c.page)).size
      : null,
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

export function estimateReplicate(
  usage: Usage | null,
  rates: Rates | null,
  kind: PricingKind,
  unitRate: number | null,
  meta: CallMetadata,
): number | null {
  if (kind === "tokens") return estimate(usage, rates);
  if (meta.status !== "succeeded") return null;
  if (kind === "output_tokens_only") {
    const out =
      usage?.output_tokens ??
      meta.metrics?.output_token_count ??
      meta.metrics?.output_tokens ??
      meta.metrics?.token_output_count;
    return typeof out === "number" && Number.isFinite(out) && out >= 0 && rates
      ? (out * rates.output) / 1e6
      : null;
  }
  if (unitRate === null || !Number.isFinite(unitRate) || unitRate < 0)
    return null;
  if (kind === "per_page" || kind === "fixed_per_run") return unitRate;
  const seconds = meta.metrics?.predict_time;
  if (
    kind === "per_second" &&
    typeof seconds === "number" &&
    Number.isFinite(seconds) &&
    seconds >= 0
  )
    return seconds * unitRate;
  return null;
}
