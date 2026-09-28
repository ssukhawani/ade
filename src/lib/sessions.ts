import type { PageResult } from "./extraction";
import { summarize, type Charge } from "./costs";
export type PdfSession = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  pageCount: number;
  currentPage: number;
  model: string;
  results: Record<number, PageResult>;
  charges: Charge[];
  errors: Record<number, string>;
};
export type SessionSummary = Pick<
  PdfSession,
  "id" | "name" | "createdAt" | "updatedAt" | "pageCount"
> & { completed: number; costUsd: number; unknownCalls: number };
const DB_NAME = "ade-document-sessions";
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of ["sessions", "pdfs", "summaries"])
        db.createObjectStore(store, { keyPath: "id" });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () =>
      reject(request.error || new Error("Browser database unavailable"));
    request.onblocked = () =>
      reject(new Error("Close other app tabs and retry browser storage."));
  });
}
async function transaction<T>(
  stores: string[],
  mode: IDBTransactionMode,
  work: (tx: IDBTransaction) => () => T,
): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    tx.oncomplete = () => {
      db.close();
      try {
        resolve(result());
      } catch (error) {
        reject(error);
      }
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error || new Error("Browser storage operation failed"));
    };
    tx.onerror = () => {};
    let result: () => T;
    try {
      result = work(tx);
    } catch (error) {
      tx.abort();
      db.close();
      reject(error);
    }
  });
}
export function saveSession(session: PdfSession, pdf?: File) {
  const summary: SessionSummary = {
    id: session.id,
    name: session.name,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    pageCount: session.pageCount,
    completed: Object.keys(session.results).length,
    costUsd: summarize(session.charges).costUsd,
    unknownCalls: summarize(session.charges).unknownCalls,
  };
  return transaction(["sessions", "pdfs", "summaries"], "readwrite", (tx) => {
    tx.objectStore("sessions").put(session);
    tx.objectStore("summaries").put(summary);
    if (pdf) tx.objectStore("pdfs").put({ id: session.id, file: pdf });
    return () => summary;
  });
}
export function listSessions() {
  return transaction(["summaries"], "readonly", (tx) => {
    const req = tx.objectStore("summaries").getAll();
    return () =>
      (req.result as SessionSummary[]).sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      );
  });
}
export function getSession(id: string) {
  return transaction(["sessions", "pdfs"], "readonly", (tx) => {
    const session = tx.objectStore("sessions").get(id);
    const pdf = tx.objectStore("pdfs").get(id);
    return () => {
      if (!session.result || !pdf.result?.file)
        throw new Error("Saved PDF session was not found.");
      return {
        session: session.result as PdfSession,
        file: pdf.result.file as File,
      };
    };
  });
}
export function deleteSession(id: string) {
  return transaction(["sessions", "pdfs", "summaries"], "readwrite", (tx) => {
    for (const store of ["sessions", "pdfs", "summaries"])
      tx.objectStore(store).delete(id);
    return () => undefined;
  });
}
