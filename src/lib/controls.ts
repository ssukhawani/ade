import type { PageResult } from "./extraction";
export function controlRows(result: PageResult) {
  const extracted = (result.controls || []).map((c, index) => {
    const verification = result.verification?.controls?.find(
      (v: any) => v.id === c.id,
    );
    return {
      key: `extracted-${index}`,
      label: c.label || c.id,
      type: c.type,
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

export type ControlRow = ReturnType<typeof controlRows>[number];
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
