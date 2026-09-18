"use client";

import { useMemo, useState } from "react";
import type { Binding } from "@/dkg/queries";
import { Card, Empty, SectionTitle } from "@/components/ui";

/**
 * The graph, drawn.
 *
 * Every node and edge here comes from the SPARQL result shown beside it, not from application
 * state. That distinction is the whole reason this is allowed to exist: a diagram drawn from a
 * local array looks identical whether the store behind it is real or decorative, and proves
 * nothing. Clicking a node runs a second query for its triples, so the picture is a way into the
 * data rather than a replacement for it.
 *
 * Layout is deterministic columns by rdf:type rather than a force simulation. A physics layout
 * looks impressive and settles somewhere different every time, which makes it useless for
 * comparing one attempt against another.
 */

const COLUMN_ORDER = ["Canon", "Constraint", "Lesson", "Run", "PromptClause", "Review", "Finding", "Criterion"];

const TYPE_STYLE: Record<string, { fill: string; stroke: string; text: string }> = {
  Canon: { fill: "#2b2410", stroke: "#c9a227", text: "#e0bd6a" },
  Constraint: { fill: "#17171a", stroke: "#3a3a42", text: "#d6d2ca" },
  Lesson: { fill: "#2b2410", stroke: "#c9a227", text: "#e0bd6a" },
  Run: { fill: "#1e1e22", stroke: "#8b8680", text: "#f4f2ee" },
  PromptClause: { fill: "#131316", stroke: "#3a3a42", text: "#9b978e" },
  Review: { fill: "#10281f", stroke: "#3fbf92", text: "#6ddcb0" },
  Finding: { fill: "#131316", stroke: "#3a3a42", text: "#9b978e" },
  Criterion: { fill: "#10281f", stroke: "#3fbf92", text: "#6ddcb0" },
};

interface Node {
  iri: string;
  type: string;
  label: string;
  x: number;
  y: number;
}

const NODE_W = 116;
const NODE_H = 30;
const COL_GAP = 168;
const ROW_GAP = 40;

export function GraphPicture({
  rows,
  onInspect,
  busy,
}: {
  rows: Binding[];
  onInspect: (iri: string) => void;
  busy?: boolean;
}) {
  // A selection that outlives its rows simply highlights nothing, so there is no reset to do. An
  // effect clearing it would cost a cascading render to achieve the same visible result.
  const [selected, setSelected] = useState<string>();

  const { nodes, edges, width, height } = useMemo(() => layout(rows), [rows]);
  const byIri = useMemo(() => new Map(nodes.map((n) => [n.iri, n])), [nodes]);

  if (rows.length === 0) {
    return <Empty>No typed nodes came back, so there is nothing to draw.</Empty>;
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <svg width={width} height={height} className="block" role="img" aria-label="Knowledge graph">
          {edges.map((edge, i) => {
            const from = byIri.get(edge.from);
            const to = byIri.get(edge.to);
            if (!from || !to) return null;
            const active = selected === edge.from || selected === edge.to;
            const x1 = from.x + NODE_W;
            const y1 = from.y + NODE_H / 2;
            const x2 = to.x;
            const y2 = to.y + NODE_H / 2;
            const mid = (x1 + x2) / 2;
            return (
              <path
                key={i}
                d={`M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`}
                fill="none"
                stroke={active ? "#6ddcb0" : "#2a2a30"}
                strokeWidth={active ? 1.4 : 1}
              />
            );
          })}

          {nodes.map((node) => {
            const style = TYPE_STYLE[node.type] ?? TYPE_STYLE.Constraint;
            const active = selected === node.iri;
            return (
              <g
                key={node.iri}
                transform={`translate(${node.x},${node.y})`}
                onClick={() => {
                  setSelected(node.iri);
                  onInspect(node.iri);
                }}
                className="cursor-pointer"
              >
                <title>{`${node.type} · ${node.label}`}</title>
                <rect
                  width={NODE_W}
                  height={NODE_H}
                  rx={5}
                  fill={style.fill}
                  stroke={active ? "#6ddcb0" : style.stroke}
                  strokeWidth={active ? 1.8 : 1}
                />
                <text x={8} y={12} fontSize={8} fill={style.stroke} fontFamily="ui-monospace, monospace">
                  {node.type.toUpperCase()}
                </text>
                <text x={8} y={23} fontSize={9.5} fill={style.text} fontFamily="ui-sans-serif, system-ui">
                  {truncate(node.label, 17)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-basalt-800 px-4 py-2.5 font-mono text-[10px] text-bone-500">
        <span>
          {nodes.length} nodes · {edges.length} edges
        </span>
        <span>drawn from the rows on the right, click any node for its triples</span>
        {busy ? <span className="text-verdigris-400">loading…</span> : null}
      </div>
    </Card>
  );
}

/**
 * Columns by type, rows by arrival order.
 *
 * Reading left to right follows the direction knowledge travels: the canon holds constraints and
 * lessons, those become clauses of a run, the run earns a review, the review records findings
 * against criteria.
 */
function layout(rows: Binding[]): { nodes: Node[]; edges: Array<{ from: string; to: string }>; width: number; height: number } {
  const seen = new Map<string, { type: string; label: string }>();
  const edges: Array<{ from: string; to: string }> = [];

  const remember = (iri?: string, typeIri?: string, body?: string) => {
    if (!iri || !typeIri) return;
    const type = typeIri.split("#").pop() ?? "Node";
    const existing = seen.get(iri);
    // A node appears in many rows; keep the first body that actually carried text.
    if (!existing) seen.set(iri, { type, label: body ?? shortIri(iri) });
    else if (body && existing.label === shortIri(iri)) existing.label = body;
  };

  for (const row of rows) {
    remember(row.s, row.sType, row.sBody);
    remember(row.o, row.oType, row.oBody);
    if (row.s && row.o && row.s !== row.o) edges.push({ from: row.s, to: row.o });
  }

  const columns = new Map<number, Node[]>();
  const nodes: Node[] = [];

  for (const [iri, { type, label }] of seen) {
    const index = COLUMN_ORDER.indexOf(type);
    const column = index === -1 ? COLUMN_ORDER.length : index;
    const bucket = columns.get(column) ?? [];
    const node: Node = { iri, type, label, x: column * COL_GAP + 16, y: bucket.length * ROW_GAP + 16 };
    bucket.push(node);
    columns.set(column, bucket);
    nodes.push(node);
  }

  const tallest = Math.max(1, ...[...columns.values()].map((c) => c.length));
  const widest = Math.max(1, ...[...columns.keys()].map((c) => c + 1));

  return {
    nodes,
    // Drop duplicate edges: the same pair recurs across rows and overdrawing them muddies the lines.
    edges: dedupe(edges),
    width: widest * COL_GAP + 32,
    height: tallest * ROW_GAP + 24,
  };
}

function dedupe(edges: Array<{ from: string; to: string }>): Array<{ from: string; to: string }> {
  const seen = new Set<string>();
  return edges.filter((e) => {
    const key = `${e.from}|${e.to}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function shortIri(iri: string): string {
  return iri.split("/").filter(Boolean).slice(-2).join("/");
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function GraphPictureSection({ children }: { children: React.ReactNode }) {
  return (
    <section>
      <SectionTitle hint="nodes and edges straight from the query">The graph</SectionTitle>
      {children}
    </section>
  );
}
