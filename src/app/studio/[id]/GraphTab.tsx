"use client";

import { useCallback, useEffect, useState } from "react";
import type { Project } from "@/core/schemas";
import { Badge, Button, Card, Empty, SectionTitle } from "@/components/ui";
import { GraphPicture, GraphPictureSection } from "./GraphPicture";
import { AskPanel } from "./AskPanel";
import { describeNode, projectShape } from "@/dkg/queries";

interface Preset {
  label: string;
  description: string;
  sparql: string;
}

interface QueryResult {
  bindings: Array<Record<string, string | undefined>>;
  servedBy: string;
  ms: number;
  truncated?: boolean;
  error?: string;
}

/**
 * The graph, open to inspection.
 *
 * A console rather than a picture, and deliberately so. A rendered node diagram is easy to make and
 * proves nothing — it is drawn from application state and looks identical whether the graph behind
 * it is real or decorative. A query box answers the harder question: ask the store whatever you
 * like, in the standard query language, and see what comes back. The first preset is the exact query
 * the compiler runs before every render, so "does the prompt really come from the graph" is something
 * anyone can check for themselves.
 */
export function GraphTab({ project }: { project: Project }) {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [sparql, setSparql] = useState("");
  const [result, setResult] = useState<QueryResult>();
  const [busy, setBusy] = useState(false);
  // The picture is fed by its own query so that changing the console's text cannot silently redraw
  // it into something the rows no longer support.
  const [shape, setShape] = useState<QueryResult>();

  const run = useCallback(
    async (query: string) => {
      setBusy(true);
      try {
        const response = await fetch(`/api/projects/${project.id}/query`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sparql: query }),
        });
        setResult(await response.json());
      } catch (error) {
        setResult({ bindings: [], servedBy: "?", ms: 0, error: String(error) });
      } finally {
        setBusy(false);
      }
    },
    [project.id]
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const response = await fetch(`/api/projects/${project.id}/query`, { cache: "no-store" });
      const data = await response.json();
      if (cancelled || !data.presets?.length) return;
      setPresets(data.presets);
      setSparql(data.presets[0].sparql);
      // Open on the compiler's own query already answered, rather than an empty box.
      void run(data.presets[0].sparql);
      void fetch(`/api/projects/${project.id}/query`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sparql: projectShape(project.id) }),
      })
        .then((r) => r.json())
        .then((d) => { if (!cancelled) setShape(d); })
        .catch(() => undefined);
    })();
    return () => {
      cancelled = true;
    };
  }, [project.id, run]);

  const columns = result?.bindings.length ? Object.keys(result.bindings[0]) : [];

  // Clicking a node asks the store what it knows about it, and drops the answer into the console —
  // so the picture always hands you back to the queryable thing rather than ending the trail.
  const inspect = useCallback(
    (iri: string) => {
      const q = describeNode(iri);
      setSparql(q);
      void run(q);
    },
    [run]
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <aside>
        <SectionTitle>Ask the graph</SectionTitle>
        <ul className="grid gap-1.5">
          {presets.map((preset) => (
            <li key={preset.label}>
              <button
                onClick={() => {
                  setSparql(preset.sparql);
                  void run(preset.sparql);
                }}
                className="w-full rounded border border-basalt-800 bg-basalt-900 p-3 text-left transition-colors hover:border-basalt-700"
              >
                <span className="block text-sm text-bone-200">{preset.label}</span>
                <span className="mt-1 block text-xs text-bone-500">{preset.description}</span>
              </button>
            </li>
          ))}
        </ul>

        <p className="mt-4 text-xs text-bone-500">
          Read-only: SELECT, ASK, CONSTRUCT and DESCRIBE. A store that accepted updates from a browser
          would let any page rewrite the provenance record.
        </p>
      </aside>

      <section className="grid gap-6">
        <AskPanel
          projectId={project.id}
          onUseQuery={(q) => {
            setSparql(q);
            void run(q);
          }}
        />

        {shape ? (
          <GraphPictureSection>
            <GraphPicture rows={shape.bindings ?? []} onInspect={inspect} busy={busy} />
          </GraphPictureSection>
        ) : null}

        <div>
        <SectionTitle
          hint={
            result ? (
              <span className="flex items-center gap-2">
                <Badge tone={result.servedBy === "file" ? "neutral" : "verified"}>via {result.servedBy}</Badge>
                {result.ms}ms
              </span>
            ) : undefined
          }
        >
          SPARQL
        </SectionTitle>

        <textarea
          value={sparql}
          onChange={(event) => setSparql(event.target.value)}
          rows={10}
          spellCheck={false}
          className="w-full rounded border border-basalt-700 bg-basalt-950 p-3 font-mono text-xs text-bone-200 focus:border-verdigris-500/60"
        />

        <div className="mt-2 flex items-center gap-3">
          <Button variant="primary" disabled={busy} onClick={() => run(sparql)}>
            {busy ? "Running…" : "Run query"}
          </Button>
          {result?.error ? <span className="text-sm text-terracotta-400">{result.error}</span> : null}
        </div>

        <div className="mt-4">
          {!result || result.error ? null : result.bindings.length === 0 ? (
            <Empty>No rows. The graph has nothing matching that pattern yet.</Empty>
          ) : (
            <Card className="overflow-x-auto">
              <table className="w-full text-left font-mono text-[11px]">
                <thead>
                  <tr className="border-b border-basalt-800">
                    {columns.map((column) => (
                      <th key={column} className="px-3 py-2 font-normal uppercase tracking-wider text-bone-500">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.bindings.map((row, index) => (
                    <tr key={index} className="border-b border-basalt-850 last:border-0">
                      {columns.map((column) => (
                        <td key={column} className="max-w-xs truncate px-3 py-1.5 text-bone-300" title={row[column]}>
                          {shorten(row[column])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {result.truncated ? (
                <p className="border-t border-basalt-800 px-3 py-2 text-[11px] text-bone-500">
                  Truncated at 500 rows.
                </p>
              ) : null}
            </Card>
          )}
        </div>
        </div>
      </section>
    </div>
  );
}

/** IRIs are long and their tail is the informative part; a table of full IRIs is unreadable. */
function shorten(value: string | undefined): string {
  if (!value) return "";
  if (value.startsWith("https://stele.studio/")) return `…/${value.split("/").slice(-2).join("/")}`;
  return value;
}
