import {
  Circle,
  CircleDot,
  Square,
  SquareCheck,
  CircleHelp,
  EyeOff,
} from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";
import { controlRows } from "../lib/controls";
import type { PageResult } from "../lib/extraction";
export function PageControls({
  result,
  compact = false,
  onDetails,
  hiddenKeys,
}: {
  result: PageResult;
  compact?: boolean;
  hiddenKeys?: Set<string>;
  onDetails?: () => void;
}) {
  const rows = controlRows(result).filter((c) => !hiddenKeys?.has(c.key));
  const groups = new Map<string, typeof rows>();
  rows.forEach((row) =>
    groups.set(row.group, [...(groups.get(row.group) || []), row]),
  );
  if (compact && !rows.length) return null;
  return (
    <section
      aria-label={
        compact ? "Checkboxes and radio buttons" : "Control verification"
      }
      className={compact ? "mb-6" : ""}
    >
      {compact ? (
        <>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">
              Checkboxes &amp; radio buttons ({rows.length})
            </h4>
            <Button variant="ghost" size="sm" onClick={onDetails}>
              Verification details
            </Button>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            Extracted states are shown below. Differences from verification are
            flagged for review.
          </p>
        </>
      ) : (
        <p className="mb-4 text-xs leading-5 text-muted-foreground">
          Compare extraction and verification with the source. Agreement between
          passes does not guarantee accuracy.
        </p>
      )}
      {!rows.length && (
        <p className="text-sm text-muted-foreground">No controls detected.</p>
      )}
      {[...groups].map(([group, controls]) => (
        <div key={group} className="mb-4">
          <h5 className="mb-2 text-xs font-semibold text-muted-foreground">
            {group}
          </h5>
          <div className="space-y-2">
            {controls.map((c) => {
              const Icon =
                c.state === "CHECKED"
                  ? c.type === "radio"
                    ? CircleDot
                    : SquareCheck
                  : c.state === "UNCHECKED"
                    ? c.type === "radio"
                      ? Circle
                      : Square
                    : c.state === "NOT_VISIBLE"
                      ? EyeOff
                      : CircleHelp;
              return (
                <div
                  key={c.key}
                  className={cn(
                    "rounded-lg border p-3",
                    c.review && "border-amber-200 bg-amber-50/50",
                  )}
                >
                  <div className="flex items-start gap-2">
                    <Icon
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-medium">
                        {c.label}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{c.state}</Badge>
                        {c.review && (
                          <span className="text-xs font-medium text-amber-700">
                            Review needed
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {c.additional && (
                    <p className="mt-2 text-xs text-amber-700">
                      Found only during verification; not in the extraction
                      pass.
                    </p>
                  )}
                  {!c.additional &&
                    (compact ? c.verifiedState !== c.state : true) && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>Verification:</span>
                        <Badge variant="outline">
                          {c.verifiedState || "NOT VERIFIED"}
                        </Badge>
                      </div>
                    )}
                  {!compact && (
                    <>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {c.type} · Confidence: {c.confidence || "Not reported"}
                      </p>
                      {c.notes && (
                        <p className="mt-2 text-xs leading-5">{c.notes}</p>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
