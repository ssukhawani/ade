import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  Circle,
  FileText,
  KeyRound,
  Loader2,
  ScanLine,
  Settings2,
  ShieldCheck,
  Upload,
  X,
  AlertTriangle,
  Eye,
  EyeOff,
} from "lucide-react";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Badge } from "./components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import {
  claude,
  renderPages,
  extractionPrompt,
  verifyPrompt,
  type PageResult,
} from "./lib/extraction";
import { cn } from "./lib/utils";
import "./style.css";
import {
  defaultRates,
  validRate,
  estimate,
  summarize,
  costLabel,
  money,
  PRICING_URL,
  type Charge,
  type Usage,
} from "./lib/costs";
import { PageControls } from "./components/page-controls";
import { ExtractedTable } from "./components/extracted-table";
import {
  controlRows,
  tableControlLinks,
  tableCellSelections,
} from "./lib/controls";
import { SessionHistory } from "./components/session-history";
import {
  saveSession,
  listSessions,
  getSession,
  deleteSession,
  type PdfSession,
  type SessionSummary,
} from "./lib/sessions";
import { CostSummary } from "./components/cost-summary";
function readPrices(): Record<string, { input: string; output: string }> {
  try {
    const saved = JSON.parse(localStorage.getItem("ade-prices") || "{}");
    return saved && typeof saved === "object" && !Array.isArray(saved)
      ? saved
      : {};
  } catch {
    return {};
  }
}

const KEY_STORAGE = "ade-api-key";
function readKey() {
  try {
    return localStorage.getItem(KEY_STORAGE) || "";
  } catch {
    return "";
  }
}
function needsReview(result?: PageResult) {
  return (
    !!result &&
    (controlRows(result).some((c) => c.review) ||
      [...tableCellSelections(result).values()].flat().some((c) => c.review))
  );
}
function App() {
  const [key, setKey] = useState(readKey);
  const [savedKey, setSavedKey] = useState(readKey);
  const [settings, setSettings] = useState(() => !readKey());
  const [showKey, setShowKey] = useState(false);
  const [storageMessage, setStorageMessage] = useState("");
  const [model, setModel] = useState("claude-sonnet-5");
  const [prices, setPrices] = useState(readPrices);
  const [charges, setCharges] = useState<Charge[]>([]);
  const [priceMessage, setPriceMessage] = useState("");
  const defaults = defaultRates(model.trim());
  const price = prices[model.trim()] || {
    input: defaults ? String(defaults.input) : "",
    output: defaults ? String(defaults.output) : "",
  };
  const rates =
    validRate(price.input) && validRate(price.output)
      ? { input: Number(price.input), output: Number(price.output) }
      : null;
  function changePrice(field: "input" | "output", value: string) {
    const next = { ...prices, [model.trim()]: { ...price, [field]: value } };
    setPrices(next);
    try {
      localStorage.setItem("ade-prices", JSON.stringify(next));
      setPriceMessage(
        "Rates saved for this model. Applied to future calls only.",
      );
    } catch {
      setPriceMessage(
        "Rates apply for this session; browser storage is unavailable.",
      );
    }
  }
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<string[]>([]);
  const [results, setResults] = useState<Record<number, PageResult>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [current, setCurrent] = useState(0);
  const [status, setStatus] = useState("Upload a PDF to get started");
  const [busy, setBusy] = useState(false);
  const [activePage, setActivePage] = useState<number | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [tab, setTab] = useState("overview");
  const fileInput = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  const stop = useRef(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [saveStatus, setSaveStatus] = useState("");
  const [saveError, setSaveError] = useState("");
  const createdAt = useRef("");
  const writes = useRef<Promise<void>>(Promise.resolve());
  const activeSession = useRef<string | null>(null);
  const saveFailed = useRef(false);
  const persistedPdfs = useRef(new Set<string>());
  const saveVersion = useRef(0);
  useEffect(() => {
    listSessions()
      .then(setSessions)
      .catch((e) => setSaveError(`Session history unavailable: ${e.message}`));
  }, []);
  function enqueueSave(snapshot: PdfSession, pdf: File) {
    const version = ++saveVersion.current;
    setSaveStatus("Saving session…");
    writes.current = writes.current.then(async () => {
      try {
        // Original PDF is stored with the record atomically; IndexedDB handles the File as a blob.
        const summary = await saveSession(
          snapshot,
          persistedPdfs.current.has(snapshot.id) ? undefined : pdf,
        );
        persistedPdfs.current.add(snapshot.id);
        setSessions((old) =>
          [summary, ...old.filter((s) => s.id !== summary.id)].sort((a, b) =>
            b.updatedAt.localeCompare(a.updatedAt),
          ),
        );
        if (
          activeSession.current === snapshot.id &&
          version === saveVersion.current
        ) {
          saveFailed.current = false;
          setSaveError("");
          setSaveStatus("Session saved in this browser");
        }
      } catch (e) {
        if (activeSession.current === snapshot.id) {
          saveFailed.current = true;
          setSaveStatus("Session not saved");
          setSaveError(
            `Could not save session: ${e instanceof Error ? e.message : String(e)}. Keep this tab open and export JSON, or free browser storage and retry.`,
          );
        }
      }
    });
    return writes.current;
  }
  function snapshot(): PdfSession | null {
    if (!sessionId || !file) return null;
    return {
      id: sessionId,
      name: file.name,
      createdAt: createdAt.current,
      updatedAt: new Date().toISOString(),
      pageCount: pages.length,
      currentPage: current,
      model,
      results,
      charges,
      errors,
    };
  }
  useEffect(() => {
    const data = snapshot();
    if (data && file) void enqueueSave(data, file);
  }, [sessionId, file, results, charges, errors, current, model]);
  async function openSaved(id: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    await writes.current;
    if (saveFailed.current) {
      lock.current = false;
      setBusy(false);
      return;
    }
    try {
      const saved = await getSession(id);
      const rendered = await renderPages(saved.file, setStatus);
      persistedPdfs.current.add(id);
      activeSession.current = id;
      createdAt.current = saved.session.createdAt;
      setFile(saved.file);
      setPages(rendered);
      setResults(saved.session.results);
      setCharges(saved.session.charges);
      setErrors(saved.session.errors);
      setCurrent(Math.min(saved.session.currentPage, rendered.length - 1));
      setModel(saved.session.model);
      setSessionId(id);
      setProgress({ done: 0, total: 0 });
      setStatus(
        "Saved session restored. Select a page to review or continue extraction.",
      );
      setHistoryOpen(false);
    } catch (e) {
      setSaveError(
        `Could not open session: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function removeSaved(id: string) {
    if (
      lock.current ||
      !window.confirm(
        "Delete this saved session and its PDF, results, and costs from this browser?",
      )
    )
      return;
    lock.current = true;
    setBusy(true);
    await writes.current;
    try {
      await deleteSession(id);
      setSessions((old) => old.filter((s) => s.id !== id));
      if (id === activeSession.current) {
        activeSession.current = null;
        setSessionId(null);
        setFile(null);
        setPages([]);
        setResults({});
        setCharges([]);
        setErrors({});
        setCurrent(0);
        setSaveStatus("");
        setSaveError("");
        saveFailed.current = false;
        setStatus("Session deleted. Upload a PDF to get started.");
      }
    } catch (e) {
      setSaveError(
        `Could not delete session: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const result = results[current];
  const selectionCells = result ? tableCellSelections(result) : new Map();
  const tableLinks = result ? tableControlLinks(result) : new Map();
  const tableControlKeys = new Set<string>(
    [...tableLinks.values()].map((link) => link.control.key),
  );
  const completed = Object.keys(results).length;
  function saveKey() {
    try {
      localStorage.setItem(KEY_STORAGE, key.trim());
      setKey(key.trim());
      setSavedKey(key.trim());
      setStorageMessage("API key saved in this browser.");
    } catch {
      setStorageMessage(
        "Browser storage is unavailable. You can still use the key for this session.",
      );
    }
  }
  function forgetKey() {
    try {
      localStorage.removeItem(KEY_STORAGE);
      setKey("");
      setSavedKey("");
      setStorageMessage("Saved API key removed.");
    } catch {
      setStorageMessage(
        "Could not clear browser storage. Remove the key in your browser’s site settings.",
      );
    }
  }
  async function load(f: File) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    await writes.current;
    if (saveFailed.current) {
      lock.current = false;
      setBusy(false);
      return;
    }
    activeSession.current = null;
    setSessionId(null);
    setSaveStatus("");
    setFile(f);
    setPages([]);
    setResults({});
    setCharges([]);
    setErrors({});
    setCurrent(0);
    setProgress({ done: 0, total: 0 });
    try {
      const rendered = await renderPages(f, setStatus);
      setPages(rendered);
      createdAt.current = new Date().toISOString();
      const id = crypto.randomUUID();
      activeSession.current = id;
      setSessionId(id);
      setStatus(`${rendered.length} pages ready for extraction`);
    } catch (e) {
      setStatus(
        `Could not open PDF: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function run(indices: number[]) {
    if (lock.current || !key.trim() || !model.trim() || !indices.length) return;
    lock.current = true;
    stop.current = false;
    setBusy(true);
    setProgress({ done: 0, total: indices.length });
    let count = 0,
      failed = 0;
    for (const i of indices) {
      if (stop.current) break;
      setActivePage(i);
      setErrors((old) => {
        const next = { ...old };
        delete next[i];
        return next;
      });
      const recordUsage = (pass: Charge["pass"]) => (usage: Usage | null) => {
        const charge: Charge = {
          page: i + 1,
          pass,
          model: model.trim(),
          timestamp: new Date().toISOString(),
          usage,
          rates,
          costUsd: estimate(usage, rates),
        };
        setCharges((old) => [...old, charge]);
      };
      try {
        setStatus(`Page ${i + 1} · extracting content`);
        const extraction = await claude(
          key.trim(),
          pages[i],
          extractionPrompt,
          model.trim(),
          recordUsage("extraction"),
        );
        if (
          !Array.isArray(extraction.fields) ||
          !Array.isArray(extraction.controls)
        )
          throw new Error(
            "Invalid extraction response. Please retry this page.",
          );
        setStatus(`Page ${i + 1} · verifying checkboxes`);
        const verification = await claude(
          key.trim(),
          pages[i],
          verifyPrompt(extraction.controls),
          model.trim(),
          recordUsage("verification"),
        );
        if (!Array.isArray(verification.controls))
          throw new Error(
            "Invalid verification response. Please retry this page.",
          );
        setResults((old) => ({
          ...old,
          [i]: {
            ...extraction,
            page: i + 1,
            verification,
            model: model.trim(),
            extractedAt: new Date().toISOString(),
          },
        }));
      } catch (e) {
        failed++;
        setErrors((old) => ({
          ...old,
          [i]: e instanceof Error ? e.message : String(e),
        }));
        // Stop on errors to avoid repeating failed paid requests. Completed pages are preserved.
        break;
      } finally {
        count++;
        setProgress({ done: count, total: indices.length });
      }
    }
    setStatus(
      failed
        ? "Extraction stopped after an error. Completed results are preserved."
        : stop.current
          ? "Stopped. Completed results are preserved."
          : `Finished · ${count} ${count === 1 ? "page" : "pages"} processed`,
    );
    setActivePage(null);
    setBusy(false);
    lock.current = false;
  }
  function download() {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            sessionId,
            file: file?.name,
            createdAt: new Date().toISOString(),
            costing: {
              currency: "USD",
              scope:
                "Current PDF session, all attempts including re-extractions",
              estimated: true,
              ...summarize(charges),
              calls: charges,
              byPage: pages.map((_, i) => ({
                page: i + 1,
                ...summarize(charges.filter((c) => c.page === i + 1)),
              })),
            },
            pages: Object.values(results).sort((a, b) => a.page - b.page),
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${file?.name || "document"}.extraction.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const ready = !busy && !!key.trim() && !!model.trim() && pages.length > 0;
  return (
    <div className="min-h-screen">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-4 px-5 py-4 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-zinc-900 p-2.5 text-white">
              <ScanLine className="size-5" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight">
                Document workspace
              </h1>
              <p className="text-xs text-muted-foreground">
                Agentic Document Extraction
              </p>
            </div>
            <Badge variant="secondary" className="ml-2 hidden sm:inline-flex">
              Local POC
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              aria-expanded={historyOpen}
              onClick={() => setHistoryOpen(!historyOpen)}
            >
              History
            </Button>
            <Button
              variant="outline"
              aria-label="API settings"
              onClick={() => setSettings(!settings)}
              aria-expanded={settings}
            >
              <Settings2 />{" "}
              <span className="hidden sm:inline">API settings</span>
              <span
                className={cn(
                  "size-2 rounded-full",
                  key ? "bg-emerald-500" : "bg-amber-500",
                )}
              />
            </Button>
            <Button
              aria-label="Export JSON"
              variant="outline"
              disabled={!completed && !charges.length}
              onClick={download}
            >
              <ArrowDownToLine />
              <span className="hidden sm:inline">Export JSON</span>
            </Button>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-[1800px] p-5 lg:p-8">
        {saveError && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm"
          >
            <p>{saveError}</p>
            {sessionId && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                disabled={busy}
                onClick={() => {
                  const data = snapshot();
                  if (data && file) void enqueueSave(data, file);
                }}
              >
                Retry saving
              </Button>
            )}
          </div>
        )}
        {historyOpen && (
          <SessionHistory
            sessions={sessions}
            currentId={sessionId}
            busy={busy}
            onOpen={openSaved}
            onDelete={removeSaved}
          />
        )}
        {settings && (
          <section
            aria-label="API settings"
            className="mb-6 rounded-xl border bg-white p-5 shadow-xs"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <KeyRound className="size-4" /> Connection settings
              </h2>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close settings"
                onClick={() => setSettings(false)}
              >
                <X />
              </Button>
            </div>
            <div className="grid items-end gap-4 md:grid-cols-[2fr_1fr_auto]">
              <div>
                <label
                  htmlFor="api-key"
                  className="mb-2 block text-xs font-medium"
                >
                  Anthropic API key
                </label>
                <div className="relative">
                  <Input
                    id="api-key"
                    type={showKey ? "text" : "password"}
                    value={key}
                    onChange={(e) => {
                      setKey(e.target.value);
                      setStorageMessage("");
                    }}
                    placeholder="sk-ant-…"
                    autoComplete="off"
                    disabled={busy}
                    className="pr-10"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 size-9"
                    aria-label={showKey ? "Hide API key" : "Show API key"}
                    onClick={() => setShowKey(!showKey)}
                  >
                    {showKey ? <EyeOff /> : <Eye />}
                  </Button>
                </div>
              </div>
              <div>
                <label
                  htmlFor="model"
                  className="mb-2 block text-xs font-medium"
                >
                  Model
                </label>
                <Input
                  id="model"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  disabled={busy}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={saveKey}
                  disabled={busy || !key.trim() || key === savedKey}
                >
                  {key && key === savedKey ? (
                    <>
                      <Check /> Saved
                    </>
                  ) : (
                    "Save key"
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={forgetKey}
                  disabled={busy || !savedKey}
                >
                  Forget key
                </Button>
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Saved keys stay in this browser’s local storage, accessible to
              scripts on this site. Use a local test key. Page images are sent
              directly to Anthropic.
            </p>
            <div className="mt-5 border-t pt-4">
              <h3 className="text-sm font-semibold">
                Cost estimates · USD per million tokens
              </h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="input-price" className="mb-2 block text-xs">
                    Input price / 1M tokens
                  </label>
                  <Input
                    id="input-price"
                    type="number"
                    min="0"
                    step="any"
                    disabled={busy}
                    value={price.input}
                    onChange={(e) => changePrice("input", e.target.value)}
                    placeholder="Enter input rate"
                  />
                </div>
                <div>
                  <label htmlFor="output-price" className="mb-2 block text-xs">
                    Output price / 1M tokens
                  </label>
                  <Input
                    id="output-price"
                    type="number"
                    min="0"
                    step="any"
                    disabled={busy}
                    value={price.output}
                    onChange={(e) => changePrice("output", e.target.value)}
                    placeholder="Enter output rate"
                  />
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {defaults
                  ? "Sonnet 5 defaults: $2 input / $10 output, checked September 28, 2026. "
                  : "Enter your model’s rates to enable dollar estimates. "}
                <a
                  href={PRICING_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  Anthropic pricing
                </a>
                . Estimates use reported usage from both passes, including image
                tokens. Rates are captured per call.
              </p>
              {!rates && (
                <p className="mt-2 text-xs text-amber-700">
                  Set valid non-negative rates to calculate costs. Token usage
                  is still tracked.
                </p>
              )}
              {priceMessage && <p className="mt-2 text-xs">{priceMessage}</p>}
            </div>
            {storageMessage && (
              <p role="status" className="mt-2 text-xs font-medium">
                {storageMessage}
              </p>
            )}
          </section>
        )}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-[.16em] text-muted-foreground">
              Extraction studio
            </p>
            <h2 className="text-2xl font-semibold tracking-tight">
              Every page. Every detail.
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Extract a page, compare it with the source, then move to the next.
            </p>
          </div>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
          >
            <Upload />
            {file ? "Change PDF" : "Upload PDF"}
          </Button>
          <input
            ref={fileInput}
            aria-label="Upload PDF"
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              if (e.target.files?.[0]) void load(e.target.files[0]);
              e.target.value = "";
            }}
          />
        </div>
        {!pages.length ? (
          <section className="flex min-h-[440px] flex-col items-center justify-center rounded-2xl border border-dashed bg-white p-8 text-center">
            <div className="mb-5 rounded-2xl bg-zinc-100 p-5">
              {busy ? (
                <Loader2 className="size-8 animate-spin text-zinc-500" />
              ) : (
                <FileText className="size-8 text-zinc-500" />
              )}
            </div>
            <h3 className="text-lg font-semibold">Start with a document</h3>
            <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
              Upload a PDF to inspect fields, tables, and checkbox states, one
              page at a time.
            </p>
            <Button
              className="mt-6"
              disabled={busy}
              onClick={() => fileInput.current?.click()}
            >
              <Upload />
              Choose PDF
            </Button>
            <p role="status" className="mt-4 text-xs text-muted-foreground">
              {status}
            </p>
          </section>
        ) : (
          <>
            <section className="mb-4 rounded-xl border bg-white p-4 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="rounded-lg bg-zinc-100 p-2.5">
                    <FileText className="size-5 text-zinc-500" />
                  </div>
                  <div className="min-w-0">
                    <h3
                      className="max-w-[280px] truncate text-sm font-semibold"
                      title={file?.name}
                    >
                      {file?.name}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {pages.length} pages <span className="mx-1">·</span>{" "}
                      {completed} extracted <span className="mx-1">·</span>{" "}
                      {Object.values(results).filter(needsReview).length} to
                      review
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button disabled={!ready} onClick={() => run([current])}>
                    <ScanLine />
                    {result ? "Re-extract" : "Extract"} page {current + 1}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!ready}
                    onClick={() => run(pages.map((_, i) => i))}
                  >
                    <CheckCheck />
                    Extract all pages
                  </Button>
                  {busy && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        stop.current = true;
                        setStatus("Stopping after the current page…");
                      }}
                    >
                      Stop after page
                    </Button>
                  )}
                </div>
              </div>
              <div
                className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"
                role="status"
                aria-live="polite"
              >
                {busy ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <ShieldCheck className="size-3" />
                )}
                {status}
                {!key.trim() && " · Add your API key in settings."}
              </div>
              {busy && progress.total > 0 && (
                <div
                  role="progressbar"
                  aria-label="Extraction progress"
                  aria-valuenow={progress.done}
                  aria-valuemax={progress.total}
                  aria-valuemin={0}
                  className="mt-3 h-1 overflow-hidden rounded-full bg-zinc-100"
                >
                  <div
                    className="h-full bg-zinc-800 transition-all"
                    style={{
                      width: `${(progress.done / progress.total) * 100}%`,
                    }}
                  />
                </div>
              )}
            </section>
            <CostSummary charges={charges} title="PDF total so far" />
            <main className="grid items-start gap-4 xl:grid-cols-[160px_minmax(0,1fr)_minmax(0,1fr)]">
              <nav
                aria-label="Document pages"
                className="rounded-xl border bg-white p-3 xl:max-h-[calc(100vh-310px)] xl:overflow-y-auto"
              >
                <h3 className="mb-3 px-2 text-xs font-semibold text-muted-foreground">
                  PAGES <span className="float-right">{pages.length}</span>
                </h3>
                <div className="flex gap-1 overflow-x-auto xl:flex-col">
                  {pages.map((_, i) => (
                    <button
                      key={i}
                      aria-label={`Page ${i + 1}`}
                      onClick={() => setCurrent(i)}
                      aria-current={i === current ? "page" : undefined}
                      className={cn(
                        "flex shrink-0 items-center justify-between gap-4 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-zinc-100",
                        i === current && "bg-zinc-100 font-semibold",
                      )}
                    >
                      <span className="text-left">
                        Page {i + 1}
                        {charges.some((c) => c.page === i + 1) && (
                          <span className="mt-1 block text-[10px] font-normal text-muted-foreground">
                            {costLabel(charges.filter((c) => c.page === i + 1))}
                          </span>
                        )}
                      </span>
                      {activePage === i ? (
                        <Loader2
                          aria-label="Processing"
                          className="size-3.5 animate-spin"
                        />
                      ) : errors[i] || needsReview(results[i]) ? (
                        <AlertTriangle
                          aria-label="Needs review"
                          className="size-3.5 text-amber-600"
                        />
                      ) : results[i] ? (
                        <Check
                          aria-label="Extracted"
                          className="size-3.5 text-emerald-600"
                        />
                      ) : (
                        <Circle
                          aria-label="Not extracted"
                          className="size-3 text-zinc-300"
                        />
                      )}
                    </button>
                  ))}
                </div>
              </nav>
              <section
                aria-label="Document preview"
                className="overflow-hidden rounded-xl border bg-white"
              >
                <div className="flex items-center justify-between border-b px-4 py-3">
                  <span className="text-sm font-medium">Source document</span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Previous page"
                      disabled={current === 0}
                      onClick={() => setCurrent(current - 1)}
                    >
                      <ArrowLeft />
                    </Button>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {current + 1} / {pages.length}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Next page"
                      disabled={current === pages.length - 1}
                      onClick={() => setCurrent(current + 1)}
                    >
                      <ArrowRight />
                    </Button>
                  </div>
                </div>
                <div className="max-h-[75vh] overflow-auto bg-zinc-100 p-4 xl:h-[calc(100vh-370px)] xl:min-h-[480px]">
                  <img
                    src={pages[current]}
                    alt={`Source PDF page ${current + 1}`}
                    className="mx-auto w-full shadow-sm"
                  />
                </div>
              </section>
              <section
                aria-label="Extraction results"
                className="min-w-0 overflow-hidden rounded-xl border bg-white"
              >
                <div className="flex h-[61px] items-center justify-between border-b px-5">
                  <h3 className="text-sm font-medium">
                    Page {current + 1} results
                  </h3>
                  <Badge variant="secondary">
                    {activePage === current
                      ? "Processing"
                      : errors[current]
                        ? "Error"
                        : result
                          ? needsReview(result)
                            ? "Review needed"
                            : "Extracted"
                          : "Not extracted"}
                  </Badge>
                </div>
                <div className="p-5 xl:max-h-[calc(100vh-370px)] xl:min-h-[480px] xl:overflow-auto">
                  <CostSummary
                    charges={charges.filter((c) => c.page === current + 1)}
                    title={`Page ${current + 1} cost`}
                    details
                  />
                  {errors[current] && (
                    <div
                      role="alert"
                      className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-700"
                    >
                      <p className="font-semibold">
                        Could not extract this page
                      </p>
                      <p className="break-words">{errors[current]}</p>
                      {result && (
                        <p>Showing the previous successful extraction.</p>
                      )}
                    </div>
                  )}
                  {!result ? (
                    <div className="flex min-h-[370px] flex-col items-center justify-center text-center">
                      <div className="mb-4 rounded-full bg-zinc-100 p-4">
                        <ScanLine className="size-6 text-zinc-400" />
                      </div>
                      <h4 className="text-sm font-semibold">
                        Ready for a closer look
                      </h4>
                      <p className="mt-2 max-w-[260px] text-sm leading-6 text-muted-foreground">
                        Extract this page to review its content and verify every
                        checkbox against the source.
                      </p>
                      <Button
                        variant="outline"
                        className="mt-5"
                        disabled={!ready}
                        onClick={() => run([current])}
                      >
                        Extract page {current + 1}
                        <ArrowRight />
                      </Button>
                    </div>
                  ) : (
                    <Tabs value={tab} onValueChange={setTab}>
                      <TabsList className="mb-5 w-full">
                        <TabsTrigger value="overview" className="flex-1">
                          Overview
                        </TabsTrigger>
                        <TabsTrigger value="controls" className="flex-1">
                          Controls ({controlRows(result).length})
                        </TabsTrigger>
                        <TabsTrigger value="json" className="flex-1">
                          JSON
                        </TabsTrigger>
                      </TabsList>
                      <TabsContent value="overview">
                        <div className="mb-5 grid grid-cols-3 gap-2">
                          {[
                            ["Fields", result.fields.length],
                            ["Controls", controlRows(result).length],
                            ["Tables", result.tables?.length || 0],
                          ].map(([label, value]) => (
                            <div key={label} className="rounded-lg border p-3">
                              <p className="text-xl font-semibold">{value}</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {label}
                              </p>
                            </div>
                          ))}
                        </div>
                        <PageControls
                          result={result}
                          compact
                          hiddenKeys={tableControlKeys}
                          onDetails={() => setTab("controls")}
                        />
                        <div className="mb-4 flex items-center justify-between">
                          <h4 className="text-sm font-semibold">
                            Extracted fields
                          </h4>
                          <Badge variant="outline">{result.page_type}</Badge>
                        </div>
                        {result.fields.length === 0 && (
                          <p className="text-sm text-muted-foreground">
                            No fields detected on this page.
                          </p>
                        )}
                        {result.fields.map((f: any, i) => (
                          <div
                            key={i}
                            className="grid grid-cols-2 gap-4 border-b py-3 text-sm"
                          >
                            <span className="break-words text-muted-foreground">
                              {f.label || "Unlabelled field"}
                            </span>
                            <span className="whitespace-pre-wrap break-words font-medium">
                              {typeof f.value === "object"
                                ? JSON.stringify(f.value)
                                : String(f.value ?? "—")}
                            </span>
                          </div>
                        ))}
                        {(result.tables || []).map(
                          (table: any, index: number) => (
                            <ExtractedTable
                              key={index}
                              table={table}
                              index={index}
                              links={tableLinks}
                              selectionCells={selectionCells}
                              onDetails={() => setTab("controls")}
                            />
                          ),
                        )}
                        {[
                          "sections",
                          "handwriting",
                          "signatures",
                          "other_content",
                        ].map((k) => {
                          const values = (result as any)[k];
                          return (
                            values?.length > 0 && (
                              <details
                                key={k}
                                className="mt-4 rounded-lg border p-3"
                              >
                                <summary className="cursor-pointer text-sm font-medium capitalize">
                                  {k.replace("_", " ")} ({values.length})
                                </summary>
                                <pre className="mt-3 whitespace-pre-wrap break-words text-xs text-muted-foreground">
                                  {JSON.stringify(values, null, 2)}
                                </pre>
                              </details>
                            )
                          );
                        })}
                      </TabsContent>
                      <TabsContent value="controls">
                        <PageControls result={result} />
                      </TabsContent>
                      <TabsContent value="json">
                        <pre className="overflow-x-auto rounded-lg bg-zinc-950 p-4 text-xs leading-6 text-zinc-200">
                          {JSON.stringify(result, null, 2)}
                        </pre>
                      </TabsContent>
                    </Tabs>
                  )}
                </div>
              </section>
            </main>
          </>
        )}
        <footer className="mt-5 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="size-3.5" />
            Local workspace · Direct Anthropic connection
          </span>
          <span>
            {saveStatus || "PDF sessions are saved locally in this browser."}
          </span>
        </footer>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
