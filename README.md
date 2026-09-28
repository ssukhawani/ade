# Agentic Document Extraction — Client-only POC

A React + Vite workspace with shadcn/ui components for reviewing document extraction and checkbox accuracy.

## Run

```bash
npm install
npm run dev
```

1. Open **API settings**, enter your Anthropic API key and model identifier, and click **Save key**. The key persists in this browser across reloads. **Forget key** removes it.
2. Upload a PDF. PDF.js renders its pages locally.
3. Select a page in the page list, then click **Extract page N**. Each extraction performs a content pass and a checkbox/radio verification pass.
4. Compare the source with the **Overview**, **Controls**, and **JSON** tabs. Disagreements, ambiguous states, and controls missed by the first pass are available for review.
5. Use **Re-extract page N** to retry a page without clearing other results, or **Extract all pages** to process the entire PDF again. **Stop after page** finishes the current page before stopping. A failed request stops the run and preserves completed results.
6. **Export JSON** downloads all successfully extracted pages in page order, including their model and extraction timestamp.

PDFs, results, errors, page selection, and costs automatically save in IndexedDB. After a reload, use **History → Open** to restore a session and continue. Each upload creates a new session, even for the same filename. The API key is saved only when you click Save key; unsaved keys work for the current session.

## Local testing credentials

This POC calls Anthropic directly from the browser. Saved keys are stored unencrypted in localStorage and are accessible to scripts on the same origin. Use a limited/revocable testing key on a trusted local machine; do not deploy publicly. Rendered page images are sent to Anthropic for extraction. Model access depends on your account; edit the model identifier in settings as needed.

## Validation

```bash
npm run typecheck
npm run build
npm test
```

Browser tests use a generated PDF and mocked Anthropic responses; they do not use a real API key or evaluate model accuracy. Playwright requires Chromium (`npx playwright install chromium` if not already installed).

Two model passes agreeing does not prove correctness. Manually compare against the source, especially for false-CHECKED results. Crop verification and a labelled accuracy benchmark remain future work.

Future production path: browser → backend → LiteLLM → AWS Bedrock AU, with persisted jobs/results, retries and human review.

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
