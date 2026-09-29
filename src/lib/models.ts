import catalog from "./benchmark-models.json" with { type: "json" };
import type { Rates } from "./costs";
export type Provider = "anthropic" | "replicate";
export type PricingKind =
  | "tokens"
  | "fixed_per_run"
  | "per_page"
  | "output_tokens_only"
  | "per_second"
  | "unknown";
export type BenchmarkModel = {
  model: string;
  official: boolean;
  adapter: string;
  params: Record<string, unknown>;
  pricing: {
    kind: PricingKind;
    input_per_million?: number;
    output_per_million?: number;
    usd?: number;
    note?: string;
  };
};
export const BENCHMARK_MODELS = Object.values(catalog) as BenchmarkModel[];
export const modelDefinition = (model: string) =>
  BENCHMARK_MODELS.find((c) => c.model === model);
export const isOCR = (model: string) =>
  ["glm", "deepseek", "datalab", "dots"].includes(
    modelDefinition(model)?.adapter || "",
  );
export const REPLICATE_MODELS = BENCHMARK_MODELS.map((c) => [
  c.model,
  c.model.split("/")[1],
]);
// Current verified Replicate rates take precedence over older benchmark snapshots.
export function replicateRates(model: string): Rates | null {
  if (model === "openai/gpt-5.6-sol") return null; // Public page still advertises an expired promotional rate.
  if (model === "openai/gpt-5.6-luna") return { input: 1, output: 6 };
  const p = modelDefinition(model)?.pricing;
  return p &&
    (p.kind === "tokens" || p.kind === "output_tokens_only") &&
    p.output_per_million !== undefined
    ? { input: p.input_per_million || 0, output: p.output_per_million }
    : null;
}
export type ModelConfig = {
  model: string;
  version: string;
  official: boolean;
  promptField?: string;
  imageField: string;
  imageArray: boolean;
  defaults: Record<string, unknown>;
  tokenField?: string;
  maxTokens: number;
  outputSchema: unknown;
  mode: "vision" | "ocr";
};
