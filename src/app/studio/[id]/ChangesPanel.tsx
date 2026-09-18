"use client";

import { useMemo } from "react";
import type { Project, Run } from "@/core/schemas";
import { diffAttempts, previousComparable, type ClauseChange } from "@/core/attempt-diff";
import { Card, Money, SectionTitle } from "@/components/ui";

/**
 * What changed since the attempt before.
 *
 * The panel answers the objection directly: not "the score went up" but "these clauses entered the
 * prompt, they came from here, and these criteria moved". Everything is derived from the two runs'
 * own records, so it stays true for a pair that got worse as readily as one that improved.
 */
export function ChangesPanel({ project, run }: { project: Project; run: Run }) {
  const previous = useMemo(() => previousComparable(project, run), [project, run]);
  const diff = useMemo(() => (previous ? diffAttempts(project, previous, run) : undefined), [project, previous, run]);

  if (!diff || !previous) return null;

  const scoreDelta =
    diff.scoreAfter !== undefined && diff.scoreBefore !== undefined ? diff.scoreAfter - diff.scoreBefore : undefined;
  const costDelta = diff.costAfter - diff.costBefore;
  const nothingChanged = diff.added.length === 0 && diff.removed.length === 0;

  return (
    <Card className="p-4">
      <SectionTitle hint={`attempt ${diff.from} to ${diff.to}`}>What changed</SectionTitle>

      {diff.toWasControl ? (
        <p className="mb-3 rounded border border-terracotta-500/40 bg-terracotta-900 px-3 py-2 text-xs text-terracotta-400">
          This attempt withheld the canon on purpose, so the clauses below were removed rather than
          lost. That is the control condition working.
        </p>
      ) : null}

      <dl className="mb-4 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[11px]">
        <Stat label="score">
          {diff.scoreBefore ?? "—"} → {diff.scoreAfter ?? "—"}
          {scoreDelta ? (
            <span className={scoreDelta > 0 ? " text-verdigris-400" : " text-terracotta-400"}>
              {" "}
              ({scoreDelta > 0 ? "+" : ""}
              {scoreDelta})
            </span>
          ) : null}
        </Stat>
        <Stat label="clauses">
          <span className="text-verdigris-400">+{diff.added.length}</span>{" "}
          <span className="text-terracotta-400">−{diff.removed.length}</span>
        </Stat>
        <Stat label="cost">
          <Money usd={diff.costBefore} /> → <Money usd={diff.costAfter} />
          {Math.abs(costDelta) > 0.01 ? (
            <span className={costDelta < 0 ? " text-verdigris-400" : " text-bone-400"}>
              {" "}
              ({costDelta > 0 ? "+" : "−"}
              {Math.abs((costDelta / (diff.costBefore || 1)) * 100).toFixed(0)}%)
            </span>
          ) : null}
        </Stat>
      </dl>

      {diff.fixed.length > 0 || diff.broken.length > 0 ? (
        <ul className="mb-4 grid gap-1.5">
          {diff.fixed.map((c) => (
            <li key={`f${c.index}`} className="flex gap-2 text-[13px]">
              <span className="text-verdigris-400">✓</span>
              <span className="text-bone-300">
                <span className="text-verdigris-400">now passes</span> {c.body}
              </span>
            </li>
          ))}
          {diff.broken.map((c) => (
            <li key={`b${c.index}`} className="flex gap-2 text-[13px]">
              <span className="text-terracotta-400">✕</span>
              <span className="text-bone-300">
                <span className="text-terracotta-400">now fails</span> {c.body}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {nothingChanged ? (
        <p className="text-xs text-bone-500">
          The prompt was identical. Any difference between these two cuts came from the generator, not
          from the knowledge.
        </p>
      ) : (
        <div className="grid gap-3">
          <ClauseList title="entered the prompt" tone="added" changes={diff.added} />
          <ClauseList title="left the prompt" tone="removed" changes={diff.removed} />
        </div>
      )}
    </Card>
  );
}

function ClauseList({
  title,
  tone,
  changes,
}: {
  title: string;
  tone: "added" | "removed";
  changes: ClauseChange[];
}) {
  if (changes.length === 0) return null;
  const added = tone === "added";

  return (
    <div>
      <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-bone-500">
        <span className={added ? "text-verdigris-400" : "text-terracotta-400"}>{added ? "+" : "−"}</span>{" "}
        {changes.length} {title}
      </p>
      <ul className="grid gap-1.5">
        {changes.map(({ clause, origin }) => (
          <li
            key={clause.index}
            className={`rounded border px-3 py-2 ${
              added
                ? "border-verdigris-500/30 bg-verdigris-900/40"
                : "border-terracotta-500/25 bg-terracotta-900/30"
            }`}
          >
            <p className="text-[13px] text-bone-200">{clause.body}</p>
            <p className="mt-1 text-[11px] text-bone-500">{origin}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="uppercase tracking-wider text-bone-500">{label}</dt>
      <dd className="mt-0.5 text-bone-200">{children}</dd>
    </div>
  );
}
