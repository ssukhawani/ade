import { test, expect } from "@playwright/test";
import { pdf } from "./fixtures";
import {
  predictionUsage,
  parseModelOutput,
  inspectModel,
} from "../src/lib/replicate";
import { estimateReplicate } from "../src/lib/costs";
import { replicateRelay } from "../server/replicate-relay";
import { Readable } from "node:stream";

function schemas(image = "images", array = true, prompt = true) {
  const Input = {
    type: "object",
    required: [image, ...(prompt ? ["prompt"] : [])],
    properties: {
      [image]: array
        ? { type: "array", items: { type: "string", format: "uri" } }
        : { type: "string", format: "uri" },
      ...(prompt ? { prompt: { type: "string" } } : {}),
      max_output_tokens: { type: "integer", maximum: 16000, default: 1000 },
      thinking_level: { type: "string", default: "low" },
    },
  };
  return {
    latest_version: {
      id: "abc123",
      openapi_schema: {
        components: {
          schemas: {
            Input,
            Output: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
  };
}

const extraction = {
  page_type: "form",
  fields: [{ label: "Name", value: "Replicate result" }],
  controls: [],
  tables: [],
  sections: [],
  handwriting: [],
  signatures: [],
  other_content: [],
};
async function prepare(page: any, model = "google/gemini-3-flash") {
  await page.goto("/");
  await page.getByLabel("Provider", { exact: true }).selectOption("replicate");
  await page.getByLabel("Replicate API key").fill("test-replicate-key");
  await page.getByRole("button", { name: "Save key", exact: true }).click();
  await page.getByLabel("Model", { exact: true }).selectOption(model);
  await page.getByLabel("Upload PDF", { exact: true }).setInputFiles({
    name: "experiment.pdf",
    mimeType: "application/pdf",
    buffer: pdf(),
  });
  await expect(page.getByText("2 pages ready for extraction")).toBeVisible();
}

test("Replicate polls two-pass vision, records cost and time, saves model session and exports provenance", async ({
  page,
}) => {
  let submitted = 0;
  const bodies: any[] = [];
  await page.route("**/api/replicate/**", async (route) => {
    expect(route.request().headers().authorization).toBe(
      "Bearer test-replicate-key",
    );
    const url = route.request().url();
    if (route.request().method() === "GET" && url.includes("/models/"))
      return route.fulfill({ json: schemas() });
    if (route.request().method() === "POST") {
      submitted++;
      bodies.push(route.request().postDataJSON());
      return route.fulfill({
        json: { id: `p${submitted}`, status: "processing" },
      });
    }
    const id = url.split("/").pop();
    return route.fulfill({
      json: {
        id,
        status: "succeeded",
        version: "abc123",
        metrics: {
          token_input_count: 1000,
          token_output_count: 100,
          predict_time: 2,
        },
        output: [JSON.stringify(id === "p1" ? extraction : { controls: [] })],
      },
    });
  });
  await prepare(page);
  await page
    .getByRole("button", { name: "Extract page 1", exact: true })
    .first()
    .click();
  await expect(
    page.getByText("Replicate result", { exact: true }),
  ).toBeVisible();
  expect(submitted).toBe(2);
  expect(bodies[0].input.images[0]).toMatch(/^data:image\/jpeg;base64,/);
  expect(bodies[0].input.prompt).toContain("forensic document extraction");
  expect(bodies[1].input.prompt).toContain("checkbox/radio auditor");
  expect(bodies[0].input.thinking_level).toBe("high");
  expect(bodies[0].input.max_output_tokens).toBe(12000);
  await expect(
    page.getByRole("region", { name: "PDF total so far" }),
  ).toContainText("$0.001600");
  await expect(page.getByRole("region", { name: "Page 1 cost" })).toContainText(
    "measured",
  );
  await expect(page.getByLabel("Provider", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("Model", { exact: true })).toBeDisabled();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const stream = await (await pending).createReadStream();
  let text = "";
  for await (const chunk of stream!) text += chunk;
  const data = JSON.parse(text);
  expect(data.experiment.provider).toBe("replicate");
  expect(data.experiment.documentSha256).toMatch(/^[0-9a-f]{64}$/);
  expect(data.experiment.modelConfig.version).toBe("abc123");
  expect(data.costing.calls).toHaveLength(2);
  expect(data.costing.calls[0].predictionId).toBe("p1");
  expect(data.costing.calls[0].durationMs).toBeGreaterThan(0);
  expect(text).not.toContain("test-replicate-key");
  await expect(
    page.getByText("Session saved in this browser", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Open session experiment.pdf", exact: true })
    .click();
  if (!(await page.getByLabel("Provider", { exact: true }).isVisible()))
    await page.getByRole("button", { name: "API settings" }).click();
  await expect(page.getByLabel("Provider", { exact: true })).toHaveValue(
    "replicate",
  );
  await expect(page.getByLabel("Model", { exact: true })).toHaveValue(
    "google/gemini-3-flash",
  );
  await expect(page.getByLabel("Replicate API key")).toHaveValue(
    "test-replicate-key",
  );
  await expect(
    page.getByText("Replicate result", { exact: true }),
  ).toBeVisible();
  expect(submitted).toBe(2);
  await page
    .getByRole("button", { name: "New model experiment", exact: true })
    .click();
  await expect(page.getByText("2 pages ready for extraction")).toBeVisible();
  await expect(page.getByLabel("Model", { exact: true })).toBeEnabled();
  await page.getByLabel("Provider", { exact: true }).selectOption("anthropic");
  await expect(page.getByLabel("Anthropic API key")).toHaveValue("");
  await page.getByLabel("Provider", { exact: true }).selectOption("replicate");
  await expect(page.getByLabel("Replicate API key")).toHaveValue(
    "test-replicate-key",
  );
  await page.screenshot({
    path: "/tmp/ade-replicate-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/ade-replicate-mobile.png",
    fullPage: true,
  });
});

test("native OCR uses a single request and explicit per-run estimate, preserving native output", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/api/replicate/**", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: schemas("image", false, false) });
    requests++;
    const body = route.request().postDataJSON();
    expect(body.version).toBe("abc123");
    expect(body.input.image).toMatch(/^data:image\/jpeg/);
    expect(body.input.prompt).toBeUndefined();
    return route.fulfill({
      json: {
        id: "ocr1",
        status: "succeeded",
        version: "abc123",
        metrics: { predict_time: 3 },
        output: "# Invoice\nTotal: 123",
      },
    });
  });
  await prepare(page, "lucataco/glm-ocr");
  await expect(page.getByLabel("Billing basis")).toHaveValue("fixed_per_run");
  await page
    .getByRole("button", { name: "Extract page 1", exact: true })
    .first()
    .click();
  await expect(
    page.getByText("Native OCR output · no checkbox verification"),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "PDF total so far" }),
  ).toContainText("$0.001000");
  expect(requests).toBe(1);
});

test("missing metrics and malformed JSON retain raw output and show unknown cost; incompatible schema costs nothing", async ({
  page,
}) => {
  let predictions = 0;
  let badSchema = false;
  await page.route("**/api/replicate/**", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({
        json: badSchema ? schemas("images", true, false) : schemas(),
      });
    predictions++;
    return route.fulfill({
      json: { id: "bad1", status: "succeeded", output: ["not JSON"] },
    });
  });
  await prepare(page);
  await page
    .getByRole("button", { name: "Extract page 1", exact: true })
    .first()
    .click();
  await expect(page.getByRole("alert")).toContainText("invalid JSON");
  await expect(
    page.getByRole("region", { name: "PDF total so far" }),
  ).toContainText("Unavailable");
  expect(predictions).toBe(1);
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const stream = await (await pending).createReadStream();
  let text = "";
  for await (const chunk of stream!) text += chunk;
  expect(JSON.parse(text).costing.calls[0].rawOutput).toEqual(["not JSON"]);
  await page
    .getByRole("button", { name: "New model experiment", exact: true })
    .click();
  await expect(page.getByText("2 pages ready for extraction")).toBeVisible();
  badSchema = true;
  await page
    .getByRole("button", { name: "Extract page 1", exact: true })
    .first()
    .click();
  await expect(
    page.getByText(/This wrapper does not expose both/),
  ).toBeVisible();
  expect(predictions).toBe(1);
  await expect(
    page.getByRole("region", { name: "PDF total so far" }),
  ).toContainText("0 calls");
});

test("provider-reported metric variants, logs, native outputs and pricing bases are handled without fabricated usage", () => {
  expect(
    predictionUsage({
      metrics: { token_input_count: 1000, token_output_count: 200 },
    }),
  ).toEqual({ input_tokens: 1000, output_tokens: 200 });
  expect(
    predictionUsage({ logs: "Input token count: 100\nOutput token count: 20" }),
  ).toEqual({ input_tokens: 100, output_tokens: 20 });
  expect(predictionUsage({ metrics: { predict_time: 1 } })).toBeNull();
  expect(
    predictionUsage({ metrics: { input_tokens: -1, output_tokens: 3 } }),
  ).toBeNull();
  expect(parseModelOutput(["```json\n", '{"controls":[]}', "\n```"])).toEqual({
    controls: [],
  });
  expect(
    estimateReplicate(null, null, "per_second", 0.01, {
      status: "succeeded",
      metrics: { predict_time: 5 },
    }),
  ).toBe(0.05);
  expect(
    estimateReplicate(
      null,
      { input: 0, output: 0.25 },
      "output_tokens_only",
      null,
      { status: "succeeded", metrics: { token_output_count: 1000 } },
    ),
  ).toBe(0.00025);
  expect(
    estimateReplicate(null, null, "fixed_per_run", 0.01, { status: "failed" }),
  ).toBeNull();
});

test("local relay rejects arbitrary paths, remote origins and missing credentials without upstream requests", async () => {
  async function invoke(
    url: string,
    headers: Record<string, string>,
    method = "GET",
  ) {
    const req = Readable.from(
      method === "POST"
        ? [
            Buffer.from(
              JSON.stringify({
                input: { images: ["data:image/jpeg;base64,abc"] },
              }),
            ),
          ]
        : [],
    ) as any;
    req.url = url;
    req.method = method;
    req.headers = { host: "127.0.0.1:5173", ...headers };
    Object.defineProperty(req, "socket", {
      value: { remoteAddress: "127.0.0.1" },
    });
    return await new Promise<{ status: number; body: string }>((resolve) => {
      const res: any = {
        statusCode: 200,
        setHeader() {},
        end(body: string) {
          resolve({ status: this.statusCode, body });
        },
      };
      void replicateRelay(req, res, () => resolve({ status: 404, body: "" }));
    });
  }
  expect(
    (await invoke("/api/replicate/v1/models/google/gemini-3-flash", {})).status,
  ).toBe(401);
  expect(
    (
      await invoke("/api/replicate/v1/models/google/gemini-3-flash", {
        origin: "https://evil.example",
        authorization: "Bearer fake",
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await invoke("/api/replicate/v1/account", {
        authorization: "Bearer fake",
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await invoke("/api/replicate/https://evil.example", {
        authorization: "Bearer fake",
      })
    ).status,
  ).toBe(404);
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, init) => {
      expect(String(url)).toBe(
        "https://api.replicate.com/v1/models/google/gemini-3-flash/predictions",
      );
      expect((init?.headers as any).Authorization).toBe("Bearer fake");
      expect((init?.headers as any).Prefer).toBe("wait=60");
      expect(JSON.parse(String(init?.body)).input.images).toEqual([
        "data:image/jpeg;base64,abc",
      ]);
      return new Response(
        JSON.stringify({ id: "local-test", status: "processing" }),
        { status: 201 },
      );
    };
    const result = await invoke(
      "/api/replicate/v1/models/google/gemini-3-flash/predictions",
      { authorization: "Bearer fake" },
      "POST",
    );
    expect(result.status).toBe(201);
    expect(JSON.parse(result.body).id).toBe("local-test");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
