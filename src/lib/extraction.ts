import type { Usage } from "./costs";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;
export type Control = {
  id: string;
  type: string;
  visual_kind?: "checkbox" | "radio" | "other";
  label: string;
  state: "CHECKED" | "UNCHECKED" | "AMBIGUOUS" | "NOT_VISIBLE";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  bbox?: number[] | null;
  group?: string | null;
};
export type PageResult = {
  page: number;
  page_type: string;
  sections: any[];
  fields: any[];
  controls: Control[];
  tables: any[];
  handwriting: any[];
  signatures: any[];
  other_content: any[];
  verification?: any;
};

export const extractionPrompt = `You are a forensic document extraction engine. Inspect ONE rendered PDF page image exhaustively. Return ONLY valid JSON, no markdown. Never infer checkbox/radio state from nearby text: determine it from the visible mark inside/over the control. Enumerate ALL visible controls, including unchecked ones. For uncertain controls use AMBIGUOUS, never guess. Preserve printed and handwritten content. Extract tables row-by-row. Distinguish actual form widgets from table cells: a checkbox/radio has its own small outline or circle independent of the table grid. A whole grid cell is NOT a checkbox, even when instructions say to mark X or select an option. Preserve X/ticks and blank cells in tables.rows only; do not duplicate bare table selection cells in controls, including blank Reinvest/Cash payment rows. Actual checkboxes/radios drawn inside tables must still appear in controls. For each real control set visual_kind to checkbox, radio, or other based on its visible shape. Distinguish signatures from ordinary handwriting. bbox is optional normalized [x1,y1,x2,y2] in 0..1000 coordinates; use null if unsure. JSON shape: {"page_type":"form|checklist|report|identity|legal|other","sections":[],"fields":[{"label":"","value":"","kind":"printed|handwritten|date|number|other","confidence":"HIGH|MEDIUM|LOW","bbox":null}],"controls":[{"id":"c1","type":"checkbox|radio|other","visual_kind":"checkbox|radio|other","label":"","group":null,"state":"CHECKED|UNCHECKED|AMBIGUOUS|NOT_VISIBLE","confidence":"HIGH|MEDIUM|LOW","bbox":null}],"tables":[{"title":"","headers":[],"rows":[]}],"handwriting":[],"signatures":[{"present":true,"label":"","bbox":null}],"other_content":[]}. Do not omit blank/unchecked form controls.`;
export const verifyPrompt = (controls: Control[]) =>
  `You are a checkbox/radio auditor. Inspect the page image independently. Verify EVERY visible checkbox/radio control and the candidate controls below. Return ONLY JSON: {"controls":[{"id":"","label":"","verified_state":"CHECKED|UNCHECKED|AMBIGUOUS|NOT_VISIBLE","confidence":"HIGH|MEDIUM|LOW","bbox":null,"notes":""}],"missed_controls":[{"label":"","type":"checkbox|radio","state":"CHECKED|UNCHECKED|AMBIGUOUS","confidence":"HIGH|MEDIUM|LOW","bbox":null}]}. Never infer state from semantics. Table grid cells are not checkbox/radio widgets. Do not enumerate bare table selection cells (including blank or X-marked Reinvest/Cash payment cells) as controls or missed_controls. Only a separately drawn small checkbox outline or radio circle is a checkbox/radio; preserve genuine widgets even when they occur inside a table. A tick, X, fill, or handwritten mark visibly crossing/inside a box may indicate checked. If visual evidence is unclear, AMBIGUOUS. Candidates: ${JSON.stringify(controls)}`;

export async function claude(
  apiKey: string,
  image: string,
  prompt: string,
  model: string,
  onUsage?: (usage: Usage | null) => void,
) {
  let recorded = false;
  try {
    const base64 = image.split(",")[1];
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model,
        max_tokens: 12000,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/jpeg",
                  data: base64,
                },
              },
              { type: "text", text: prompt },
            ],
          },
        ],
      }),
    });
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    const j = await r.json();
    recorded = true;
    onUsage?.(j.usage ?? null);
    const text =
      j.content
        ?.filter((x: any) => x.type === "text")
        .map((x: any) => x.text)
        .join("") || "";
    return JSON.parse(text.replace(/^```json\s*/, "").replace(/```$/, ""));
  } catch (error) {
    if (!recorded) onUsage?.(null);
    throw error;
  }
}
export async function renderPages(
  file: File,
  setProgress: (s: string) => void,
) {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const out: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    setProgress(`Rendering page ${i}/${pdf.numPages}`);
    const page = await pdf.getPage(i);
    const vp = page.getViewport({ scale: 2.0 });
    const c = document.createElement("canvas");
    c.width = vp.width;
    c.height = vp.height;
    await page.render({
      canvas: c,
      canvasContext: c.getContext("2d")!,
      viewport: vp,
    }).promise;
    out.push(c.toDataURL("image/jpeg", 0.92));
  }
  return out;
}
