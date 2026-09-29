# Agentic Document Extraction — Local model-comparison POC

A React + Vite workspace with shadcn/ui components for reviewing document extraction and checkbox accuracy.

## Run

```bash
npm install
npm run dev
```

1. Open **API settings**, choose Anthropic or Replicate, enter its API key and model identifier, and click **Save key**. The key persists in this browser across reloads. **Forget key** removes it.
2. Upload a PDF. PDF.js renders its pages locally.
3. Select a page in the page list, then click **Extract page N**. Vision models perform a content pass and a checkbox/radio verification pass; native OCR models perform one transcription pass.
4. Compare the source with the **Overview**, **Controls**, and **JSON** tabs. Disagreements, ambiguous states, and controls missed by the first pass are available for review.
5. Use **Re-extract page N** to retry a page without clearing other results, or **Extract all pages** to process the entire PDF again. **Stop after page** finishes the current page before stopping. A failed request stops the run and preserves completed results.
6. **Export JSON** downloads all successfully extracted pages in page order, including their model and extraction timestamp.

PDFs, results, errors, page selection, and costs automatically save in IndexedDB. After a reload, use **History → Open** to restore a session and continue. Each upload creates a new session, even for the same filename. The API key is saved only when you click Save key; unsaved keys work for the current session.

## Local testing credentials

This POC calls Anthropic directly from the browser, or Replicate through a localhost-only Vite relay. Saved keys are stored unencrypted in localStorage and are accessible to scripts on the same origin. Use a limited/revocable testing key on a trusted local machine; do not deploy publicly. Rendered page images are sent to the selected provider for extraction. Model access depends on your account; edit the model identifier in settings as needed.

## Validation

```bash
npm run typecheck
npm run build
npm test
```

Browser tests use a generated PDF and mocked Anthropic/Replicate responses; they do not use a real API key or evaluate model accuracy. Playwright requires Chromium (`npx playwright install chromium` if not already installed).

Two model passes agreeing does not prove correctness. Manually compare against the source, especially for false-CHECKED results. Crop verification and a labelled accuracy benchmark remain future work.

Future production path: browser → backend → LiteLLM → AWS Bedrock AU, with persisted jobs/results, retries and human review.

## Hosting readiness and AU testing

The current application is tested for local use. A static Vercel deployment can serve the UI, but will not run the Vite Replicate relay. Before hosted extraction testing, implement a server-side API route for the fixed Replicate upstream, protect access to the deployment, and handle hosted request size and timeout limits. Vercel Functions have a 4.5 MB request/response limit, smaller than the local relay's 16 MB limit; base64 page images count toward it. See [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite) and [function limits](https://vercel.com/docs/functions/limitations).

Browser sessions and saved keys belong to their origin. Existing localhost sessions will not automatically appear on a Vercel hostname. Use synthetic or redacted PDFs for third-party hosted testing; the corporate POC requires document processing to stay in Australia, which a Vercel region setting alone does not establish for downstream providers.

The next corporate vision adapter must use the supplied **LiteLLM gateway**, with its OpenAI-compatible HTTP interface and a spend-limited gateway key. Direct Bedrock access is explicitly denied in the infrastructure handover. Gateway URL, externally visible model aliases, pricing, and network reachability still need to be confirmed before live integration. Keep the existing per-session provider/model isolation, two-pass vision prompts, usage ledger, and exports for comparable experiments. Missing gateway pricing or usage must remain unknown, never zero.

Textract is a separate adapter using AWS SSO and the provisioned Sydney S3 bucket. Start with one small multi-page asynchronous analysis under the user's credentials before batch testing. Implement polling and throttling backoff, preserve source PDFs independently of the scratch bucket's lifecycle, and keep corporate credentials and infrastructure handover files outside Git. No corporate gateway or Textract integration is implemented yet.

## Cost tracking

The page panel shows its cumulative estimated USD cost with a per-call breakdown. **PDF total so far** sums every extraction and verification attempt for the current upload, including re-extractions and usage returned before invalid JSON or verification failures. This is spend so far, not a forecast for unprocessed pages.

Costs use Anthropic's reported input/output tokens, including image input. Sonnet 5 defaults to $2 input / $10 output per million tokens ([official pricing](https://platform.claude.com/docs/en/about-claude/pricing), checked September 28, 2026). Edit rates under API settings; overrides persist per model in this browser. Other model identifiers require explicit rates. Each call snapshots its rates, so subsequent changes do not rewrite historical estimates.

Missing usage, missing pricing, and unexpected cache usage are flagged as unknown, never silently counted as free. Amounts are estimates, not billing statements. JSON exports include the request ledger, rate snapshots, and per-page/PDF summaries. Costs and results persist with each PDF session. Reopen it from History after a reload; a new upload starts its own cost ledger.


## Browser session history

- **History** lists saved sessions with filename, save time, completed pages, and cumulative cost. **Open** restores the source PDF, results, model, last selected page, errors, and cost ledger without making model calls.
- Saves happen as results and usage arrive. Wait for **Session saved in this browser** before closing the tab. Work still in flight when a tab closes cannot finish; completed saved pages can be resumed manually.
- **Delete** removes a session and its PDF/results/costs after confirmation. It does not remove API settings or other sessions.
- Session records do not contain the API key. The original PDF is stored once per session; page previews are rendered again locally when opened.
- If browser storage is full or unavailable, the app reports that the session was not saved, keeps the current work available, and offers **Retry saving**. Export JSON before leaving an unsaved session.
- Data belongs to this browser profile and site address, including the port. It is not synced or backed up to a server. Clearing site data, private browsing, or browser storage eviction can remove it; keep JSON exports for important results.

## Replicate model-comparison experiment

This branch adds Replicate alongside direct Anthropic. Run **`npm run dev`** (restart the dev server after switching branches). In **API settings** choose **Replicate**, save its API key, select a model, and upload a PDF. **Check model** reads its live input schema without starting a prediction. Normal extraction automatically does this check if necessary.

After the first call, provider and model are locked for that session. **New model experiment** reuses the open PDF in a fresh session so you can select another model. History restores each session's provider, model, input configuration, results, and cost ledger. API keys are saved separately per provider and are not included in session records or exports. Older sessions default to Anthropic.

### Local request relay

Replicate does not support direct browser CORS requests ([Replicate maintainer explanation](https://github.com/replicate/replicate-javascript/issues/164)). The existing Vite process now includes a small localhost-only relay to `api.replicate.com`. No separate service, server database, or deployment is needed. It passes rendered page images and credentials to Replicate without logging or persisting them. Original PDFs and session records remain in IndexedDB. Both `npm run dev` and `npm run preview` include the relay; serving `dist` as static files alone does **not** support Replicate.

### Model catalog and workflows

All 19 model IDs and baseline parameters were imported from `/Users/sahilsukhwani/Desktop/replicate-document-benchmark/config/models.json` into `src/lib/benchmark-models.json`. Nothing from that repository's credentials or source documents was copied. Availability and compatible image inputs are checked against Replicate at runtime. Custom `owner/model` identifiers are also supported when they expose a compatible image + prompt schema.

- Gemini, GPT, Claude, and Granite use the same rendered page and extraction + control-audit prompts. Output must satisfy the existing JSON structure. A model which cannot follow that structure is reported as a failure; its raw response and any reported usage remain in the export.
- GLM-OCR, DeepSeek-OCR, Datalab OCR, and dots.ocr use **native OCR, one pass**. Native text/layout/confidence output is retained and shown separately. These sessions do not claim structured checkbox verification and must be compared separately from the two-pass vision workflow.
- Model parameters come from the benchmark where supported by the live schema. The output budget is up to 12,000 tokens, capped by the model schema. These settings are exported; the original benchmark's published scores and costs are not copied into this app's measurements.

### Cost and comparison exports

Pricing can use input/output tokens, output-only tokens, per prediction, per page, or per compute second. Token counts come from prediction metrics or explicitly reported token-count log lines, never text-length guesses. Compute pricing uses `metrics.predict_time`; wall-clock latency includes polling and queue time. Missing measurements stay unknown.

Most catalog rates are labelled **benchmark snapshots**, not authoritative current bills. GLM's per-run rate was explicitly a placeholder in the benchmark. Current Replicate model-page pricing overrides the benchmark's older Luna rate ($1 input / $6 output per million tokens). Sol requires a user-entered price because its page still displays a promotion that expired September 18. Verify model-page rates and your Replicate billing; you can override rates in API settings. Failed fixed-price predictions remain unknown rather than being assumed free. Long-context or special pricing tiers need a suitable rate override.

Exports include PDF SHA-256, provider/model, schema/version metadata, actual prediction IDs and versions, model parameters, prompt version/text, rendering settings, native/structured outputs, per-call timing, usage, rate snapshots, and page/PDF totals. Official models run via their official endpoints; the actual returned version is recorded per call. Other models use the inspected version hash. Comparing accuracy still requires the source PDF and labelled expected answers, especially for checkboxes; agreement between models does not establish ground truth.

No paid API calls are made by the test suite. Run `npm test` for mocked prediction, polling, cost, persistence, raw-output, native OCR, and local-relay tests.
