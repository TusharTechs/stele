"use client";

import { useEffect, useState } from "react";
import type { AskResult } from "@/core/ask";
import { Badge, Button, Card, Money, SectionTitle } from "@/components/ui";

/**
 * A question in English, and the query it became.
 *
 * The generated SPARQL is shown above the rows, not hidden behind them. A tool that paraphrases its
 * own results asks to be trusted twice over, and gives you no way to check either claim. Here the
 * model's reading of the question is printed too, so a query that answers the wrong question is
 * obvious before you read a single row.
 */
export function AskPanel({ projectId, onUseQuery }: { projectId: string; onUseQuery: (sparql: string) => void }) {
  const [question, setQuestion] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [result, setResult] = useState<AskResult>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/projects/${projectId}/ask`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setSuggestions(d.suggestions ?? []); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [projectId]);

  async function ask(q: string) {
    if (!q.trim()) return;
    setBusy(true);
    setError(undefined);
    setQuestion(q);
    try {
      const response = await fetch(`/api/projects/${projectId}/ask`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = await response.json();
      if (!response.ok) { setError(data.error ?? "That question could not be answered."); setResult(undefined); }
      else setResult(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  const columns = result?.bindings.length ? Object.keys(result.bindings[0]) : [];

  return (
    <Card className="p-4">
      <SectionTitle hint="gemini-text writes the query, the store answers it">Ask in plain English</SectionTitle>

      <form
        onSubmit={(e) => { e.preventDefault(); void ask(question); }}
        className="flex flex-wrap gap-2"
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Which rules have steered the most renders?"
          className="min-w-0 flex-1 rounded border border-basalt-700 bg-basalt-950 px-3 py-2 text-sm text-bone-50 transition-colors placeholder:text-bone-500 focus:border-verdigris-500/60"
        />
        <Button type="submit" variant="primary" disabled={busy || question.trim().length < 3}>
          {busy ? "Writing the query…" : "Ask"}
        </Button>
      </form>

      {suggestions.length > 0 && !result ? (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <li key={s}>
              <button
                onClick={() => void ask(s)}
                disabled={busy}
                className="rounded border border-basalt-700 bg-basalt-850 px-2.5 py-1 text-left text-[12px] text-bone-400 transition-colors hover:border-basalt-600 hover:text-bone-200"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p className="mt-3 rounded border border-terracotta-500/40 bg-terracotta-900 px-3 py-2 text-sm text-terracotta-400">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="mt-4 grid gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-bone-500">it read your question as</p>
            <p className="mt-1 text-[13px] text-bone-200">{result.reading}</p>
          </div>

          <details className="group">
            <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-wider text-bone-500 transition-colors hover:text-bone-200">
              the query it wrote · {result.ms}ms via {result.servedBy} · <Money usd={result.costUSD} />
            </summary>
            <pre className="mt-2 overflow-x-auto rounded border border-basalt-800 bg-basalt-950 p-3 font-mono text-[10px] leading-relaxed text-bone-300">
              {result.sparql}
            </pre>
            <Button variant="ghost" className="mt-1.5" onClick={() => onUseQuery(result.sparql)}>
              Open it in the console
            </Button>
          </details>

          {result.bindings.length === 0 ? (
            <p className="rounded border border-dashed border-basalt-700 px-3 py-4 text-center text-sm text-bone-500">
              No rows. Either the graph does not hold that, or the query asked for something else.
            </p>
          ) : (
            <div className="overflow-x-auto rounded border border-basalt-800">
              <table className="w-full text-left font-mono text-[11px]">
                <thead>
                  <tr className="border-b border-basalt-800">
                    {columns.map((c) => (
                      <th key={c} className="px-3 py-2 font-normal uppercase tracking-wider text-bone-500">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.bindings.map((row, i) => (
                    <tr key={i} className="border-b border-basalt-850 last:border-0">
                      {columns.map((c) => (
                        <td key={c} className="max-w-sm truncate px-3 py-1.5 text-bone-300" title={row[c]}>
                          {shorten(row[c])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="font-mono text-[10px] text-bone-500">
            <Badge tone="neutral">{result.bindings.length} rows</Badge>{" "}
            {result.truncated ? "truncated at 200. " : ""}The model wrote the query. It never touched the data.
          </p>
        </div>
      ) : null}
    </Card>
  );
}

function shorten(value: string | undefined): string {
  if (!value) return "";
  if (value.startsWith("https://stele.studio/")) return `…/${value.split("/").slice(-2).join("/")}`;
  return value;
}
