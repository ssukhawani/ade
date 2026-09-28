import { costLabel, money, summarize, type Charge } from "../lib/costs";
export function CostSummary({
  charges,
  title,
  details = false,
}: {
  charges: Charge[];
  title: string;
  details?: boolean;
}) {
  const summary = summarize(charges);
  return (
    <section aria-label={title} className="mb-4 rounded-xl border bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-lg font-semibold tabular-nums">
          {costLabel(charges)}{" "}
          <span className="text-xs font-normal text-muted-foreground">
            USD est.
          </span>
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {summary.calls} calls · {summary.inputTokens.toLocaleString()} input /{" "}
        {summary.outputTokens.toLocaleString()} output tokens reported
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        Includes both passes and all re-extractions for this upload. Saved with this PDF session in browser history.
      </p>
      {summary.unknownCalls > 0 && (
        <p className="mt-2 text-xs text-amber-700">
          Incomplete estimate: {summary.unknownCalls} calls have unavailable
          usage or pricing. Unknown costs are not treated as free.
        </p>
      )}
      {details && charges.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium">
            Cost per call
          </summary>
          <div className="mt-2 space-y-2">
            {charges.map((c, i) => (
              <div key={i} className="border-t pt-2 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="capitalize">
                    {i + 1}. {c.pass}
                  </span>
                  <span>
                    {c.costUsd === null ? "Unavailable" : money(c.costUsd)}
                  </span>
                </div>
                <p className="mt-1 break-words text-muted-foreground">
                  {c.model} ·{" "}
                  {c.usage
                    ? `${c.usage.input_tokens} input / ${c.usage.output_tokens} output tokens`
                    : "Usage unavailable"}
                  {c.rates
                    ? ` · $${c.rates.input} / $${c.rates.output} per 1M`
                    : " · Rates not set"}
                </p>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
