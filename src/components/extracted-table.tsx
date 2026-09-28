import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { tableCells, type ControlRow } from "../lib/controls";
export function ExtractedTable({
  table,
  index,
  links,
  onDetails,
}: {
  table: any;
  index: number;
  links: Map<string, { control: ControlRow; column: number }>;
  onDetails: () => void;
}) {
  return (
    <div className="mt-6">
      <h4 className="mb-2 text-sm font-semibold">
        {table.title || `Table ${index + 1}`}
      </h4>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-xs">
          <thead className="bg-zinc-50">
            <tr>
              {(table.headers || []).map((h: any, i: number) => (
                <th key={i} className="p-2 font-medium">
                  {String(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(table.rows || []).map((row: unknown, ri: number) => {
              const link = links.get(`${index}:${ri}`);
              const c = link?.control;
              return (
                <tr
                  key={ri}
                  className={c?.review ? "border-t bg-amber-50/50" : "border-t"}
                >
                  {tableCells(row).map((value: unknown, ci: number) => (
                    <td key={ci} className="p-2">
                      <span>{typeof value === "object"
                        ? JSON.stringify(value)
                        : String(value ?? "")}</span>
                      {c && ci === link?.column && (
                        <div className="mt-2 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-muted-foreground">
                              {c.additional
                                ? "Found during verification"
                                : "Control extraction"}
                              :
                            </span>
                            <Badge variant="outline">{c.state}</Badge>
                            {c.review && (
                              <span className="font-medium text-amber-700">
                                Review needed
                              </span>
                            )}
                          </div>
                          {!c.additional && c.verifiedState !== c.state && (
                            <p className="text-amber-700">
                              Verification: {c.verifiedState || "NOT VERIFIED"}
                            </p>
                          )}
                          <Button
                            variant="link"
                            size="sm"
                            className="h-auto px-0 py-1 text-xs"
                            onClick={onDetails}
                          >
                            Verification details
                          </Button>
                        </div>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
