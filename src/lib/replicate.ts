import type { Usage } from "./costs";
import { modelDefinition, isOCR, type ModelConfig } from "./models";
export type CallMetadata = {
  durationMs?: number;
  predictionId?: string;
  version?: string;
  metrics?: Record<string, unknown>;
  rawOutput?: unknown;
  status?: string;
};
export const OCR_PROMPT =
  "Transcribe all visible printed and handwritten text on this page faithfully. Preserve reading order, tables, and visible selection marks. Do not infer missing text or selections. Return the model’s native OCR output.";
const prefix = "/api/replicate";
async function request(path: string, key: string, body?: unknown) {
  const response = await fetch(prefix + path, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(90000),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      `Replicate ${response.status}: ${data?.detail || data?.error || response.statusText}`,
    );
  return data;
}
function resolved(schema: any, schemas: any): any {
  if (schema?.$ref)
    return resolved(schemas[schema.$ref.split("/").pop()], schemas);
  if (schema?.anyOf)
    return resolved(
      schema.anyOf.find((s: any) => s.type !== "null"),
      schemas,
    );
  if (schema?.allOf?.length === 1)
    return { ...resolved(schema.allOf[0], schemas), ...schema };
  return schema;
}
export async function inspectModel(
  key: string,
  model: string,
): Promise<ModelConfig> {
  if (!/^[\w.-]+\/[\w.-]+$/.test(model))
    throw new Error("Enter a Replicate model as owner/model.");
  const data = await request(`/v1/models/${model}`, key);
  const version = data.latest_version;
  if (!version?.id || !version?.openapi_schema?.components?.schemas)
    throw new Error("This model has no accessible input schema.");
  const schemas = version.openapi_schema.components.schemas;
  const input = schemas.Input;
  const props = input?.properties || {};
  const definition = modelDefinition(model);
  const mode = isOCR(model) ? "ocr" : "vision";
  const promptField = [
    "prompt",
    "custom_prompt",
    "text_prompt",
    "instruction",
  ].find((k) => resolved(props[k], schemas)?.type === "string");
  const imageField = [
    "images",
    "image",
    "image_input",
    "input_image",
    "image_url",
    "image_urls",
    "file",
  ].find((k) => props[k]);
  if ((!promptField && mode === "vision") || !imageField)
    throw new Error(
      "This wrapper does not expose both an image and a free-text prompt. It needs a dedicated OCR adapter and cannot run the same two-pass experiment. No prediction was started.",
    );
  const imageSchema = resolved(props[imageField], schemas);
  const imageArray = imageSchema?.type === "array";
  if (!imageArray && imageSchema?.type !== "string")
    throw new Error(
      "Unsupported image input schema. No prediction was started.",
    );
  const defaults: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    const schema = resolved(value, schemas);
    if (schema?.default !== undefined && schema.default !== null)
      defaults[key] = schema.default;
  }
  for (const [key, value] of Object.entries(definition?.params || {})) {
    if (props[key]) defaults[key] = value;
  }
  const tokenField = [
    "max_output_tokens",
    "max_completion_tokens",
    "max_tokens",
    "max_new_tokens",
  ].find((k) => props[k]);
  const maxTokens = tokenField
    ? Math.min(12000, resolved(props[tokenField], schemas)?.maximum || 12000)
    : 12000;
  for (const required of input.required || [])
    if (
      ![promptField, imageField].includes(required) &&
      defaults[required] === undefined
    )
      throw new Error(
        `This wrapper requires an additional input: ${required}. No prediction was started.`,
      );
  return {
    model,
    version: version.id,
    official: definition?.official ?? false,
    mode,
    promptField,
    imageField,
    imageArray,
    defaults,
    tokenField,
    maxTokens,
    outputSchema: schemas.Output,
  };
}
export function predictionUsage(prediction: any): Usage | null {
  const u = prediction.usage || prediction.metrics || {};
  const input =
    u?.input_tokens ??
    u?.input_token_count ??
    u?.prompt_tokens ??
    u?.token_input_count ??
    Number(
      (prediction.logs || "").match(
        /Input tokens?(?: count)?\s*[:=]\s*(\d+)/i,
      )?.[1] ?? NaN,
    );
  const output =
    u?.output_tokens ??
    u?.output_token_count ??
    u?.completion_tokens ??
    u?.token_output_count ??
    Number(
      (prediction.logs || "").match(
        /Output tokens?(?: count)?\s*[:=]\s*(\d+)/i,
      )?.[1] ?? NaN,
    );
  if (
    typeof input !== "number" ||
    typeof output !== "number" ||
    !Number.isFinite(input) ||
    !Number.isFinite(output) ||
    input < 0 ||
    output < 0
  )
    return null;
  return {
    input_tokens: input,
    output_tokens: output,
    ...(u.cache_read_input_tokens
      ? { cache_read_input_tokens: u.cache_read_input_tokens }
      : {}),
    ...(u.cache_creation_input_tokens
      ? { cache_creation_input_tokens: u.cache_creation_input_tokens }
      : {}),
  };
}
export function parseModelOutput(output: unknown) {
  if (output && typeof output === "object" && !Array.isArray(output))
    return output;
  const text =
    Array.isArray(output) && output.every((v) => typeof v === "string")
      ? output.join("")
      : typeof output === "string"
        ? output
        : null;
  if (text === null)
    throw new Error(
      "Model output is not structured JSON text. Raw output is retained in the export.",
    );
  try {
    return JSON.parse(
      text
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, ""),
    );
  } catch {
    throw new Error(
      "Model returned invalid JSON. Raw output is retained in the export; use another model or inspect its response.",
    );
  }
}
export async function replicate(
  key: string,
  image: string,
  prompt: string,
  config: ModelConfig,
  onUsage: (usage: Usage | null, meta: CallMetadata) => void,
) {
  const start = performance.now();
  let prediction: any;
  let recorded = false;
  try {
    const input = {
      ...config.defaults,
      ...(config.promptField
        ? { [config.promptField]: config.mode === "ocr" ? OCR_PROMPT : prompt }
        : {}),
      [config.imageField]: config.imageArray ? [image] : image,
      ...(config.tokenField ? { [config.tokenField]: config.maxTokens } : {}),
    };
    prediction = await request(
      config.official
        ? `/v1/models/${config.model}/predictions`
        : "/v1/predictions",
      key,
      config.official ? { input } : { version: config.version, input },
    );
    const deadline = Date.now() + 10 * 60 * 1000;
    while (!["succeeded", "failed", "canceled"].includes(prediction.status)) {
      if (!/^[a-zA-Z0-9_-]+$/.test(prediction.id || ""))
        throw new Error("Replicate returned no valid prediction ID.");
      if (Date.now() > deadline)
        throw new Error(
          `Prediction ${prediction.id} is still running. Check it on Replicate before retrying; its cost is unknown.`,
        );
      await new Promise((resolve) => setTimeout(resolve, 1000));
      prediction = await request(`/v1/predictions/${prediction.id}`, key);
    }
    recorded = true;
    onUsage(predictionUsage(prediction), {
      durationMs: performance.now() - start,
      predictionId: prediction.id,
      version: prediction.version,
      metrics: prediction.metrics,
      rawOutput: prediction.output,
      status: prediction.status,
    });
    if (prediction.status !== "succeeded")
      throw new Error(
        `Prediction ${prediction.id} ${prediction.status}: ${prediction.error || "No output"}`,
      );
    if (config.mode === "ocr")
      return {
        page_type: "ocr",
        fields: [],
        controls: [],
        tables: [],
        sections: [],
        handwriting: [],
        signatures: [],
        other_content: [{ type: "native_ocr", output: prediction.output }],
        rawOutput: prediction.output,
        verification: { controls: [], not_applicable: true },
        workflow: "native-ocr",
      };
    const output = prediction.output;
    const normalized =
      output &&
      typeof output === "object" &&
      !Array.isArray(output) &&
      !("fields" in output) &&
      !("controls" in output)
        ? (output.text ??
          output.markdown ??
          output.output_text ??
          output.content ??
          output)
        : output;
    return parseModelOutput(normalized);
  } catch (error) {
    if (!recorded)
      onUsage(null, {
        durationMs: performance.now() - start,
        predictionId: prediction?.id,
        version: config.version,
        status: prediction?.status || "unknown",
      });
    throw error;
  }
}
