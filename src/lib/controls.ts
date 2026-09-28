import type { PageResult } from "./extraction";
function allControlRows(result: PageResult) {
  const extracted = (result.controls || []).map((c, index) => {
    const verification = result.verification?.controls?.find(
      (v: any) => v.id === c.id,
    );
    return {
      key: `extracted-${index}`,
      label: c.label || c.id,
      type: c.type,
      visualKind: c.visual_kind,
      group: c.group || "Other controls",
      state: c.state,
      verifiedState: verification?.verified_state as string | undefined,
      confidence: verification?.confidence || c.confidence,
      notes: verification?.notes as string | undefined,
      additional: false,
      review:
        !verification ||
        verification.verified_state !== c.state ||
        ["AMBIGUOUS", "NOT_VISIBLE"].includes(c.state) ||
        ["AMBIGUOUS", "NOT_VISIBLE"].includes(verification?.verified_state) ||
        c.confidence === "LOW" ||
        verification?.confidence === "LOW",
    };
  });
  const additional = (result.verification?.missed_controls || []).map(
    (c: any, index: number) => ({
      key: `additional-${index}`,
      label: c.label || "Unlabelled control",
      type: c.type || "checkbox",
      visualKind: c.visual_kind as string | undefined,
      group: c.group || "Additional controls found by verification",
      state: c.state as string,
      verifiedState: undefined,
      confidence: c.confidence,
      notes: c.notes as string | undefined,
      additional: true,
      review: true,
    }),
  );
  return [...extracted, ...additional] as Array<(typeof extracted)[number]>;
}

export type ControlRow = ReturnType<typeof allControlRows>[number];

// Compatibility for older saved responses which called bare table selection cells checkboxes.
// Require an explicit row number, a unique selection-column match, and an existing cell.
// Explicit evidence of a real checkbox/radio always takes precedence.
function selectionCell(result: PageResult, control: ControlRow) {
  if (control.visualKind === "checkbox" || control.visualKind === "radio")
    return null;
  const match = control.label.match(
    /^(.+?)\s*[-–—]\s*Row\s+(\d+)(?:\s*\([^)]*\))?\s*$/i,
  );
  if (!match) return null;
  const option = normalized(match[1]);
  const row = Number(match[2]) - 1;
  const matches: string[] = [];
  (result.tables || []).forEach((table: any, ti: number) => {
    if (!Array.isArray(table.rows) || !table.rows[row]) return;
    (table.headers || []).forEach((header: unknown, ci: number) => {
      const text = normalized(header);
      if (
        /\b(distribution options?|selection|choice)\b/.test(text) &&
        text.endsWith(` ${option}`) &&
        ci < tableCells(table.rows[row]).length
      )
        matches.push(`${ti}:${row}:${ci}`);
    });
  });
  return matches.length === 1 ? matches[0] : null;
}
export function tableCellSelections(result: PageResult) {
  const cells = new Map<string, ControlRow[]>();
  for (const control of allControlRows(result)) {
    const cell = selectionCell(result, control);
    if (cell) cells.set(cell, [...(cells.get(cell) || []), control]);
  }
  return cells;
}
export function controlRows(result: PageResult) {
  return allControlRows(result).filter(
    (control) => !selectionCell(result, control),
  );
}
export function tableCells(row: unknown): unknown[] {
  return Array.isArray(row)
    ? row
    : row && typeof row === "object"
      ? Object.values(row)
      : [row];
}
function normalized(value: unknown) {
  return typeof value === "string"
    ? value
        .normalize("NFKC")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim()
    : "";
}
// Only link a unique label to a unique row. Repeated or paraphrased labels stay visible separately.
export function tableControlLinks(result: PageResult) {
  const controls = controlRows(result);
  const candidates: { rowKey: string; control: ControlRow; column: number }[] =
    [];
  (result.tables || []).forEach((table: any, ti: number) =>
    (table.rows || []).forEach((row: unknown, ri: number) => {
      const cells = tableCells(row);
      controls.forEach((control) => {
        const label = normalized(control.label);
        if (!label) return;
        const column = cells.findIndex((cell) => normalized(cell) === label);
        if (column >= 0)
          candidates.push({ rowKey: `${ti}:${ri}`, control, column });
      });
    }),
  );
  const links = new Map<string, { control: ControlRow; column: number }>();
  candidates.forEach((candidate) => {
    if (
      candidates.filter((c) => c.rowKey === candidate.rowKey).length === 1 &&
      candidates.filter((c) => c.control.key === candidate.control.key)
        .length === 1
    )
      links.set(candidate.rowKey, {
        control: candidate.control,
        column: candidate.column,
      });
  });
  return links;
}
