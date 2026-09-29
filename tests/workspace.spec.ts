import { test, expect } from "@playwright/test";
import { pdf } from "./fixtures";

test("saved key, per-page extraction, preservation, all pages, errors, export and reset", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let calls = 0;
  let fail = false;
  await page.route("https://api.anthropic.com/v1/messages", async (route) => {
    calls++;
    if (fail) {
      await route.fulfill({ status: 429, body: "Test rate limit" });
      return;
    }
    const body = route.request().postDataJSON();
    const audit = body.messages[0].content[1].text.includes(
      "checkbox/radio auditor",
    );
    const result = audit
      ? {
          controls: [
            { id: "c1", verified_state: "UNCHECKED", confidence: "HIGH" },
          ],
          missed_controls: [],
        }
      : {
          page_type: "form",
          fields: [{ label: "Name", value: `Result ${calls}` }],
          controls: [
            {
              id: "c1",
              type: "checkbox",
              label: "Consent",
              state: "CHECKED",
              confidence: "HIGH",
            },
          ],
          tables: [],
          sections: [],
          handwriting: [],
          signatures: [],
          other_content: [],
        };
    await route.fulfill({
      json: {
        usage: { input_tokens: 1000, output_tokens: 100 },
        content: [{ type: "text", text: JSON.stringify(result) }],
      },
    });
  });
  await page.goto("/");
  await page.getByLabel("Anthropic API key").fill("test-key");
  await page.getByRole("button", { name: "Save key", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "API settings" }).click();
  await expect(page.getByLabel("Anthropic API key")).toHaveValue("test-key");
  await page.getByRole("button", { name: "Close settings" }).click();
  await page.getByLabel("Upload PDF", { exact: true }).setInputFiles({
    name: "sample.pdf",
    mimeType: "application/pdf",
    buffer: pdf(),
  });
  await expect(page.getByText("2 pages ready for extraction")).toBeVisible();
  await page
    .getByRole("button", { name: "Extract page 1", exact: true })
    .first()
    .click();
  await expect(page.getByText("Result 1")).toBeVisible();
  expect(calls).toBe(2);
  await expect(
    page.getByRole("region", { name: "Page 1 cost", exact: true }),
  ).toContainText("$0.006000");
  await expect(
    page.getByRole("region", { name: "PDF total so far" }),
  ).toContainText("$0.006000");
  await page.getByRole("tab", { name: "Controls (1)" }).click();
  await expect(page.getByText("UNCHECKED", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Page 2", exact: true }).click();
  await page
    .getByRole("button", { name: "Extract page 2", exact: true })
    .first()
    .click();
  await expect(page.getByText("Finished · 1 page processed")).toBeVisible();
  expect(calls).toBe(4);
  await page.getByRole("tab", { name: "Overview", exact: true }).click();
  await expect(page.getByText("Result 3")).toBeVisible();
  await page.getByRole("button", { name: "Page 1", exact: true }).click();
  await expect(page.getByText("Result 1")).toBeVisible();
  await page
    .getByRole("button", { name: "Re-extract page 1", exact: true })
    .click();
  await expect(page.getByText("Result 5")).toBeVisible();
  await page.getByRole("button", { name: "Page 2", exact: true }).click();
  await expect(page.getByText("Result 3")).toBeVisible();
  await page
    .getByRole("button", { name: "Extract all pages", exact: true })
    .click();
  await expect(page.getByText("Finished · 2 pages processed")).toBeVisible();
  expect(calls).toBe(10);
  await expect(
    page.getByRole("region", { name: "PDF total so far" }),
  ).toContainText("$0.030000");
  fail = true;
  await page
    .getByRole("button", { name: "Re-extract page 2", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Test rate limit");
  await expect(
    page.getByRole("region", { name: "PDF total so far" }),
  ).toContainText("$0.030000 + unknown");
  await expect(page.getByText("Result 9")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  expect((await download).suggestedFilename()).toBe(
    "sample.pdf.extraction.json",
  );
  await page.screenshot({
    path: "/tmp/ade-workspace-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/ade-workspace-mobile.png",
    fullPage: true,
  });
  await page.getByLabel("Upload PDF", { exact: true }).setInputFiles({
    name: "replacement.pdf",
    mimeType: "application/pdf",
    buffer: pdf(),
  });
  await expect(page.getByText("2 pages ready for extraction")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Export JSON" }),
  ).toBeDisabled();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "API settings" }).click();
  await page.getByRole("button", { name: "Forget key" }).click();
  await page.reload();
  await expect(page.getByLabel("Anthropic API key")).toHaveValue("");
  expect(errors).toEqual([]);
});

test("costs retain failed-response usage and per-call rates; unknown models have no assumed price", async ({
  page,
}) => {
  let call = 0;
  await page.route("https://api.anthropic.com/v1/messages", async (route) => {
    call++;
    const text =
      call === 2
        ? "invalid json"
        : call % 2 === 1
          ? JSON.stringify({
              page_type: "form",
              fields: [],
              controls: [],
              tables: [],
            })
          : JSON.stringify({ controls: [] });
    await route.fulfill({
      json: {
        usage: { input_tokens: 1000, output_tokens: 100 },
        content: [{ type: "text", text }],
      },
    });
  });
  await page.goto("/");
  await page.getByLabel("Anthropic API key").fill("test-key");
  await page.getByLabel("Upload PDF", { exact: true }).setInputFiles({
    name: "cost.pdf",
    mimeType: "application/pdf",
    buffer: pdf(),
  });
  await page
    .getByRole("button", { name: "Extract page 1", exact: true })
    .first()
    .click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "PDF total so far" }),
  ).toContainText("$0.006000");
  await page.getByLabel("Input price / 1M tokens", { exact: true }).fill("4");
  await page.getByLabel("Output price / 1M tokens", { exact: true }).fill("20");
  await page
    .getByRole("button", { name: "Extract page 1", exact: true })
    .first()
    .click();
  await expect(page.getByText("Finished · 1 page processed")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "PDF total so far" }),
  ).toContainText("$0.018000");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await pending;
  const stream = await download.createReadStream();
  let text = "";
  for await (const chunk of stream!) text += chunk.toString();
  const exported = JSON.parse(text);
  expect(exported.costing.costUsd).toBeCloseTo(0.018);
  expect(exported.costing.calls).toHaveLength(4);
  expect(exported.costing.calls[0].rates.input).toBe(2);
  expect(exported.costing.calls[2].rates.input).toBe(4);
  expect(exported.costing.byPage[0].costUsd).toBeCloseTo(0.018);
  await expect(page.getByLabel("Model", { exact: true })).toBeDisabled();
  await page
    .getByRole("button", { name: "New model experiment", exact: true })
    .click();
  await expect(page.getByText("2 pages ready for extraction")).toBeVisible();
  await page.getByLabel("Model", { exact: true }).fill("custom-model");
  await expect(
    page.getByLabel("Input price / 1M tokens", { exact: true }),
  ).toHaveValue("");
  await page
    .getByRole("button", { name: "Extract page 1", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("region", { name: "PDF total so far" }),
  ).toContainText("Unavailable");
  await page
    .getByRole("button", { name: "New model experiment", exact: true })
    .click();
  await expect(page.getByText("2 pages ready for extraction")).toBeVisible();
  await page.getByLabel("Model", { exact: true }).fill("claude-sonnet-5");
  await expect(
    page.getByLabel("Input price / 1M tokens", { exact: true }),
  ).toHaveValue("4");
  await page.reload();
  await expect(
    page.getByLabel("Input price / 1M tokens", { exact: true }),
  ).toHaveValue("4");
});

test("PDF history restores results, previews and cumulative costs, isolates uploads, and deletes sessions", async ({
  page,
}) => {
  let calls = 0;
  await page.route("https://api.anthropic.com/v1/messages", async (route) => {
    calls++;
    const audit = route
      .request()
      .postDataJSON()
      .messages[0].content[1].text.includes("checkbox/radio auditor");
    await route.fulfill({
      json: {
        usage: { input_tokens: 1000, output_tokens: 100 },
        content: [
          {
            type: "text",
            text: JSON.stringify(
              audit
                ? { controls: [] }
                : {
                    page_type: "form",
                    fields: [
                      { label: "Saved value", value: "Persistent result" },
                    ],
                    controls: [],
                    tables: [],
                  },
            ),
          },
        ],
      },
    });
  });
  const upload = async (name: string) => {
    await page
      .getByLabel("Upload PDF", { exact: true })
      .setInputFiles({ name, mimeType: "application/pdf", buffer: pdf() });
    await expect(page.getByText("2 pages ready for extraction")).toBeVisible();
  };
  const saved = async () => {
    await expect(
      page.getByText("Session saved in this browser", { exact: true }),
    ).toBeVisible();
  };
  await page.goto("/");
  await page.getByLabel("Anthropic API key").fill("test-key");
  await page.getByRole("button", { name: "Save key", exact: true }).click();
  await upload("first.pdf");
  await page
    .getByRole("button", { name: "Extract page 1", exact: true })
    .first()
    .click();
  await expect(page.getByText("Persistent result")).toBeVisible();
  await page.getByRole("button", { name: "Page 2", exact: true }).click();
  await saved();
  await upload("second.pdf");
  await saved();
  await expect(page.getByTestId("saved-session")).toHaveCount(2);
  await expect(
    page.getByRole("region", { name: "PDF total so far" }),
  ).toContainText("$0.000000");
  await page.reload();
  await expect(page.getByTestId("saved-session")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Open session first.pdf", exact: true })
    .click();
  await expect(page.getByAltText("Source PDF page 2")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "PDF total so far" }),
  ).toContainText("$0.006000");
  expect(calls).toBe(2);
  await page.getByRole("button", { name: "Page 1", exact: true }).click();
  await expect(page.getByText("Persistent result")).toBeVisible();
  await page
    .getByRole("button", { name: "Re-extract page 1", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "PDF total so far" }),
  ).toContainText("$0.012000");
  await saved();
  await page.reload();
  await page
    .getByRole("button", { name: "Open session first.pdf", exact: true })
    .click();
  await expect(page.getByText("Persistent result")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "PDF total so far" }),
  ).toContainText("$0.012000");
  await saved();
  expect(calls).toBe(4);
  await page.getByRole("button", { name: "History", exact: true }).click();
  // Rejecting deletion leaves the record intact.
  page.once("dialog", (d) => d.dismiss());
  await page
    .getByRole("button", { name: "Delete session first.pdf", exact: true })
    .click();
  await expect(page.getByTestId("saved-session")).toHaveCount(2);
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Delete session first.pdf", exact: true })
    .click();
  await expect(page.getByTestId("saved-session")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Export JSON" }),
  ).toBeDisabled();
  await page.reload();
  await expect(page.getByTestId("saved-session")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Open session second.pdf", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "PDF total so far" }),
  ).toContainText("$0.000000");
  await page.getByRole("button", { name: "History", exact: true }).click();
  await upload("second.pdf");
  await saved();
  await expect(page.getByTestId("saved-session")).toHaveCount(2);
  // Sessions never copy API keys into IndexedDB.
  const stored = await page.evaluate(async () => {
    return await new Promise<string>((resolve, reject) => {
      const req = indexedDB.open("ade-document-sessions", 1);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("sessions");
        const all = tx.objectStore("sessions").getAll();
        all.onsuccess = () => resolve(JSON.stringify(all.result));
        tx.oncomplete = () => db.close();
      };
      req.onerror = () => reject(req.error);
    });
  });
  expect(stored).not.toContain("test-key");
});

test("storage failures keep the current PDF usable and allow retry saving", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = IDBObjectStore.prototype.put;
    (window as any).failSessionSave = true;
    IDBObjectStore.prototype.put = function (...args: any[]) {
      if ((window as any).failSessionSave && this.name === "sessions")
        throw new DOMException("Storage full", "QuotaExceededError");
      return original.apply(this, args as [any, IDBValidKey?]);
    };
  });
  await page.goto("/");
  await page.getByLabel("Upload PDF", { exact: true }).setInputFiles({
    name: "quota.pdf",
    mimeType: "application/pdf",
    buffer: pdf(),
  });
  await expect(page.getByRole("alert")).toContainText("Could not save session");
  await expect(page.getByAltText("Source PDF page 1")).toBeVisible();
  await expect(page.getByTestId("saved-session")).toHaveCount(0);
  await page.evaluate(() => {
    (window as any).failSessionSave = false;
  });
  await page.getByRole("button", { name: "Retry saving", exact: true }).click();
  await expect(
    page.getByText("Session saved in this browser", { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("saved-session")).toHaveCount(1);
  await page.reload();
  await page
    .getByRole("button", { name: "Open session quota.pdf", exact: true })
    .click();
  await expect(page.getByAltText("Source PDF page 1")).toBeVisible();
});

test("overview shows grouped controls without tables and preserves verification disagreements and saved results", async ({
  page,
}) => {
  let calls = 0;
  const controls = [
    {
      id: "a",
      type: "checkbox",
      group: "Australian entity type",
      label: "Company",
      state: "UNCHECKED",
      confidence: "HIGH",
    },
    {
      id: "b",
      type: "checkbox",
      group: "Australian entity type",
      label: "Superannuation fund",
      state: "CHECKED",
      confidence: "HIGH",
    },
    {
      id: "c",
      type: "radio",
      group: "Contact preference",
      label: "Email",
      state: "AMBIGUOUS",
      confidence: "LOW",
    },
    {
      id: "d",
      type: "checkbox",
      group: null,
      label: "Hidden option",
      state: "NOT_VISIBLE",
      confidence: "LOW",
    },
  ];
  await page.route("https://api.anthropic.com/v1/messages", async (route) => {
    calls++;
    const audit = route
      .request()
      .postDataJSON()
      .messages[0].content[1].text.includes("checkbox/radio auditor");
    const data = audit
      ? {
          controls: controls.map((c) => ({
            ...c,
            verified_state: c.id === "b" ? "UNCHECKED" : c.state,
          })),
          missed_controls: [
            {
              label: "Extra consent",
              state: "CHECKED",
              type: "checkbox",
              confidence: "HIGH",
            },
          ],
        }
      : {
          page_type: "form",
          fields: [{ label: "Name", value: "Example account" }],
          controls,
          tables: [],
          sections: [],
          handwriting: [],
          signatures: [],
          other_content: [],
        };
    await route.fulfill({
      json: {
        usage: { input_tokens: 100, output_tokens: 100 },
        content: [{ type: "text", text: JSON.stringify(data) }],
      },
    });
  });
  await page.goto("/");
  await page.getByLabel("Anthropic API key").fill("test-key");
  await page.getByLabel("Upload PDF", { exact: true }).setInputFiles({
    name: "controls.pdf",
    mimeType: "application/pdf",
    buffer: pdf(),
  });
  await page
    .getByRole("button", { name: "Extract page 1", exact: true })
    .first()
    .click();
  const overview = page.getByRole("tabpanel", {
    name: "Overview",
    exact: true,
  });
  const summary = overview.getByRole("region", {
    name: "Checkboxes and radio buttons",
  });
  await expect(summary.getByText("Company", { exact: true })).toBeVisible();
  await expect(
    summary.getByText("Australian entity type", { exact: true }),
  ).toBeVisible();
  await expect(
    summary.getByText("Superannuation fund", { exact: true }),
  ).toBeVisible();
  await expect(summary.getByText("AMBIGUOUS", { exact: true })).toBeVisible();
  await expect(summary.getByText("NOT_VISIBLE", { exact: true })).toBeVisible();
  await expect(
    summary.getByText("Extra consent", { exact: true }),
  ).toBeVisible();
  await expect(
    summary.getByText(
      "Found only during verification; not in the extraction pass.",
    ),
  ).toBeVisible();
  const row = summary
    .getByText("Superannuation fund", { exact: true })
    .locator("..")
    .locator("..")
    .locator("..");
  await expect(row.getByText("CHECKED", { exact: true })).toBeVisible();
  await expect(row.getByText("UNCHECKED", { exact: true })).toBeVisible();
  await expect(row.getByText("Review needed", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Controls (5)", exact: true }),
  ).toBeVisible();
  await summary.getByRole("button", { name: "Verification details" }).click();
  await expect(
    page
      .getByRole("tabpanel", { name: "Controls (5)", exact: true })
      .getByText("Company", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Overview", exact: true }).click();
  await expect(
    page.getByText("Session saved in this browser", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Open session controls.pdf", exact: true })
    .click();
  await expect(
    page
      .getByRole("region", { name: "Checkboxes and radio buttons" })
      .getByText("Company", { exact: true }),
  ).toBeVisible();
  expect(calls).toBe(2);
});

test("table controls appear once in Overview, while standalone and ambiguous matches stay visible", async ({
  page,
}) => {
  const controls = [
    {
      id: "a",
      label: "Residential and Postal Address",
      state: "CHECKED",
      type: "checkbox",
      confidence: "HIGH",
    },
    {
      id: "b",
      label: "Standalone consent",
      state: "UNCHECKED",
      type: "checkbox",
      confidence: "HIGH",
    },
    {
      id: "c",
      label: "Repeated option",
      state: "CHECKED",
      type: "checkbox",
      confidence: "HIGH",
    },
  ];
  await page.route("https://api.anthropic.com/v1/messages", async (route) => {
    const audit = route
      .request()
      .postDataJSON()
      .messages[0].content[1].text.includes("checkbox/radio auditor");
    const data = audit
      ? {
          controls: controls.map((c) => ({
            ...c,
            verified_state: c.id === "a" ? "UNCHECKED" : c.state,
          })),
          missed_controls: [],
        }
      : {
          page_type: "checklist",
          fields: [],
          controls,
          tables: [
            {
              title: "Part A Checklist",
              headers: ["Check", "Item"],
              rows: [
                ["✓", "Residential and Postal Address"],
                ["", "Repeated option"],
                ["", "Repeated option"],
                ["", "Table-only requirement"],
              ],
            },
          ],
        };
    await route.fulfill({
      json: { content: [{ type: "text", text: JSON.stringify(data) }] },
    });
  });
  await page.goto("/");
  await page.getByLabel("Anthropic API key").fill("test-key");
  await page.getByLabel("Upload PDF", { exact: true }).setInputFiles({
    name: "checklist.pdf",
    mimeType: "application/pdf",
    buffer: pdf(),
  });
  await page
    .getByRole("button", { name: "Extract page 1", exact: true })
    .first()
    .click();
  const overview = page.getByRole("tabpanel", {
    name: "Overview",
    exact: true,
  });
  await expect(
    overview.getByText("Residential and Postal Address", { exact: true }),
  ).toHaveCount(1);
  const standalone = overview.getByRole("region", {
    name: "Checkboxes and radio buttons",
  });
  await expect(
    standalone.getByText("Residential and Postal Address", { exact: true }),
  ).toHaveCount(0);
  await expect(
    standalone.getByText("Standalone consent", { exact: true }),
  ).toBeVisible();
  await expect(
    standalone.getByText("Repeated option", { exact: true }),
  ).toBeVisible();
  const row = overview
    .getByRole("row")
    .filter({ hasText: "Residential and Postal Address" });
  await expect(row.getByText("CHECKED", { exact: true })).toBeVisible();
  await expect(
    row.getByText("Verification: UNCHECKED", { exact: true }),
  ).toBeVisible();
  await expect(row.getByText("Review needed", { exact: true })).toBeVisible();
  await expect(
    overview.getByText("Table-only requirement", { exact: true }),
  ).toBeVisible();
  await row.getByRole("button", { name: "Verification details" }).click();
  await expect(
    page
      .getByRole("tabpanel", { name: "Controls (3)", exact: true })
      .getByText("Residential and Postal Address", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Session saved in this browser", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Open session checklist.pdf", exact: true })
    .click();
  await expect(
    page
      .getByRole("tabpanel", { name: "Overview", exact: true })
      .getByText("Residential and Postal Address", { exact: true }),
  ).toHaveCount(1);
});

test("investment table cells are not counted as standalone controls in legacy sessions", async ({
  page,
}) => {
  const tableRows = Array.from({ length: 8 }, (_, i) => [
    i === 0 ? "Greencape High Conviction Fund" : "",
    i === 0 ? "HOW0035AU" : "",
    i === 0 ? "$25,000" : "$",
    "$",
    "",
    i === 0 ? "X" : "",
  ]);
  const selections = tableRows.flatMap((_, i) =>
    ["Reinvest", "Cash payment"].map((option, j) => ({
      id: `cell-${i}-${j}`,
      type: "checkbox",
      label: `${option} – Row ${i + 1}${i === 0 ? " (Greencape High Conviction Fund)" : ""}`,
      group: `distribution_option_row${i + 1}`,
      state: i === 0 && j === 1 ? "CHECKED" : "UNCHECKED",
      confidence: "HIGH",
    })),
  );
  const realControls = [
    {
      id: "adviser-yes",
      type: "checkbox",
      label: "Applicant is within the target market",
      state: "CHECKED",
      confidence: "HIGH",
    },
    {
      id: "adviser-no",
      type: "checkbox",
      label: "Applicant is outside the target market",
      state: "UNCHECKED",
      confidence: "HIGH",
    },
  ];
  const controls = [...selections, ...realControls];
  let calls = 0;
  await page.route("https://api.anthropic.com/v1/messages", async (route) => {
    calls++;
    const body = route.request().postDataJSON();
    const prompt = body.messages[0].content[1].text;
    const audit = prompt.includes("checkbox/radio auditor");
    expect(prompt).toContain(
      audit
        ? "Table grid cells are not checkbox/radio widgets"
        : "A whole grid cell is NOT a checkbox",
    );
    const data = audit
      ? {
          controls: controls.map((c) => ({
            ...c,
            verified_state: c.id === "cell-0-1" ? "AMBIGUOUS" : c.state,
          })),
          missed_controls: [],
        }
      : {
          page_type: "form",
          fields: [],
          controls,
          tables: [
            {
              title: "Investment and distribution method",
              headers: [
                "Fund Name",
                "APIR Code",
                "Investment amount",
                "Regular investment plan",
                "Distribution options - Reinvest",
                "Distribution options - Cash payment",
              ],
              rows: tableRows,
            },
          ],
        };
    await route.fulfill({
      json: { content: [{ type: "text", text: JSON.stringify(data) }] },
    });
  });
  await page.goto("/");
  await page.getByLabel("Anthropic API key").fill("test-key");
  await page.getByLabel("Upload PDF", { exact: true }).setInputFiles({
    name: "investment.pdf",
    mimeType: "application/pdf",
    buffer: pdf(),
  });
  await page
    .getByRole("button", { name: "Extract page 1", exact: true })
    .first()
    .click();
  const overview = page.getByRole("tabpanel", {
    name: "Overview",
    exact: true,
  });
  await expect(
    page.getByRole("tab", { name: "Controls (2)", exact: true }),
  ).toBeVisible();
  await expect(
    overview
      .getByRole("region", { name: "Checkboxes and radio buttons" })
      .getByText("Applicant is within the target market", { exact: true }),
  ).toBeVisible();
  await expect(overview.getByText(/Reinvest – Row/)).toHaveCount(0);
  await expect(
    overview.getByText("Greencape High Conviction Fund", { exact: true }),
  ).toBeVisible();
  await expect(
    overview.getByRole("cell", { name: "X", exact: false }),
  ).toContainText("Table selection needs review");
  await page.getByRole("tab", { name: "Controls (2)", exact: true }).click();
  const tab = page.getByRole("tabpanel", { name: "Controls (2)", exact: true });
  await expect(tab.getByText(/Row 1/)).toHaveCount(0);
  await expect(
    tab.getByText("Applicant is outside the target market", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "JSON", exact: true }).click();
  await expect(
    page.getByRole("tabpanel", { name: "JSON", exact: true }),
  ).toContainText("distribution_option_row1");
  await expect(
    page.getByText("Session saved in this browser", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Open session investment.pdf", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: "Controls (2)", exact: true }),
  ).toBeVisible();
  expect(calls).toBe(2);
});
