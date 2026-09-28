import { Button } from "./ui/button";
import { money } from "../lib/costs";
import type { SessionSummary } from "../lib/sessions";
export function SessionHistory({
  sessions,
  currentId,
  busy,
  onOpen,
  onDelete,
}: {
  sessions: SessionSummary[];
  currentId: string | null;
  busy: boolean;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section
      aria-label="Saved PDF sessions"
      className="mb-6 rounded-xl border bg-white p-5"
    >
      <h2 className="text-sm font-semibold">
        Saved PDF sessions{" "}
        <span className="ml-2 text-muted-foreground">{sessions.length}</span>
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        PDFs, results, and costs are saved in this browser only. Each upload
        creates a separate session. Clearing site data removes this history;
        export important results as a backup.
      </p>
      {!sessions.length ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No saved sessions yet. Upload a PDF to start.
        </p>
      ) : (
        <div className="mt-4 max-h-72 space-y-2 overflow-auto">
          {sessions.map((s) => (
            <div
              key={s.id}
              data-testid="saved-session"
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" title={s.name}>
                  {s.name}
                  {s.id === currentId && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      Open
                    </span>
                  )}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {s.completed}/{s.pageCount} pages extracted ·{" "}
                  {money(s.costUsd)}
                  {s.unknownCalls ? " + unknown" : ""} USD est.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Saved {new Date(s.updatedAt).toLocaleString()}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || s.id === currentId}
                  onClick={() => onOpen(s.id)}
                  aria-label={`Open session ${s.name}`}
                >
                  Open
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => onDelete(s.id)}
                  aria-label={`Delete session ${s.name}`}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
