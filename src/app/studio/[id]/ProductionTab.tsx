"use client";

import { useMemo, useState } from "react";
import type { Clause, Project, Run } from "@/core/schemas";
import { Badge, Card, Empty, Money, SectionTitle, Score } from "@/components/ui";
import { ChangesPanel } from "./ChangesPanel";

/**
 * One attempt, in full: what was made, how it scored, and — the part that matters — why the prompt
 * that made it said what it said.
 */
export function ProductionTab({
  project,
  selectedAttempt,
  onSelectAttempt,
}: {
  project: Project;
  selectedAttempt?: number;
  onSelectAttempt: (attempt: number) => void;
}) {
  const run = project.runs.find((r) => r.attempt === selectedAttempt) ?? project.runs.at(-1);

  if (!run) {
    return <Empty>No attempts yet. Press “Run first attempt”. The canon is already built.</Empty>;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
      <div className="grid gap-6">
        <AttemptStrip project={project} selected={run.attempt} onSelect={onSelectAttempt} />
        <Cut project={project} run={run} />
        <Shots run={run} target={project.brief.targetScore} />
      </div>

      <div className="grid content-start gap-6">
        <WhyThisPrompt run={run} project={project} />
        <ChangesPanel project={project} run={run} />
        <Ledger run={run} />
      </div>
    </div>
  );
}

/**
 * Every attempt as a comparable row.
 *
 * A control run is marked, because a score from a run with memory withheld is not comparable to one
 * beside it without that label — it is the other half of an experiment, not a worse attempt.
 */
function AttemptStrip({
  project,
  selected,
  onSelect,
}: {
  project: Project;
  selected: number;
  onSelect: (attempt: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {project.runs.map((run) => {
        const active = run.attempt === selected;
        const score = run.review?.score;
        return (
          <button
            key={run.attempt}
            onClick={() => onSelect(run.attempt)}
            className={`rounded border px-3 py-2 text-left transition-colors ${
              active
                ? "border-verdigris-500/60 bg-basalt-850"
                : "border-basalt-800 bg-basalt-900 hover:border-basalt-700"
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] uppercase tracking-wider text-bone-500">
                try {run.attempt}
              </span>
              {run.memoryWithheld ? (
                <span className="font-mono text-[10px] uppercase text-terracotta-400">control</span>
              ) : run.basePrompt?.memoryClauseCount ? (
                <span className="font-mono text-[10px] uppercase text-bronze-300">
                  +{run.basePrompt.memoryClauseCount} learned
                </span>
              ) : null}
            </div>
            <div className="mt-1 font-mono text-lg leading-none tabular-nums">
              {score !== undefined ? (
                <span className={score >= project.brief.targetScore ? "text-verdigris-400" : "text-bone-200"}>
                  {score}
                </span>
              ) : (
                <span className="text-bone-500">{run.stage === "FAILED" ? "—" : "·"}</span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function Cut({ project, run }: { project: Project; run: Run }) {
  return (
    <section>
      <SectionTitle
        hint={
          run.memoryWithheld
            ? "control run · every learned lesson withheld"
            : `${run.basePrompt?.memoryClauseCount ?? 0} learned clauses steered this`
        }
      >
        The cut
      </SectionTitle>

      {run.cutUrl ? (
        <video
          key={run.cutUrl}
          src={run.cutUrl}
          controls
          playsInline
          className="w-full rounded-lg border border-basalt-800 bg-black"
        />
      ) : (
        <Empty>{run.error ? run.error : "This attempt produced no cut."}</Empty>
      )}

      {run.review ? (
        <Card className="mt-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <p className="max-w-xl text-sm text-bone-200">{run.review.summary}</p>
            <Score value={run.review.score} target={project.brief.targetScore} />
          </div>

          <ul className="mt-4 grid gap-2">
            {run.review.verdicts.map((verdict) => {
              const criterion = project.brief.criteria.find((c) => c.index === verdict.index);
              return (
                <li key={verdict.index} className="flex gap-3 text-sm">
                  <span className={verdict.met ? "text-verdigris-400" : "text-terracotta-400"}>
                    {verdict.met ? "✓" : "✕"}
                  </span>
                  <span className="min-w-0">
                    <span className="text-bone-200">{criterion?.body ?? `criterion ${verdict.index}`}</span>
                    {verdict.note ? <span className="block text-bone-500">{verdict.note}</span> : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}
    </section>
  );
}

function Shots({ run, target }: { run: Run; target: number }) {
  if (run.shots.length === 0) return null;

  return (
    <section>
      <SectionTitle hint="each shot gated on its own review before the cut">Shots</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {run.shots.map((shot) => (
          <Card key={shot.index} className="overflow-hidden">
            {shot.videoUrl ? (
              <video src={shot.videoUrl} controls playsInline className="aspect-video w-full bg-black" />
            ) : shot.keyframeUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shot.keyframeUrl} alt="" className="aspect-video w-full object-cover" />
            ) : (
              <div className="aspect-video w-full bg-basalt-850" />
            )}

            <div className="p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] uppercase tracking-wider text-bone-500">
                  shot {shot.index}
                  {shot.attempts > 1 ? ` · ${shot.attempts} tries` : ""}
                </span>
                {shot.review ? (
                  <Badge tone={shot.review.score >= target ? "verified" : "failed"}>
                    {shot.review.score}/10
                  </Badge>
                ) : (
                  <Badge tone="failed">{shot.status}</Badge>
                )}
              </div>
              <p className="mt-1.5 text-sm text-bone-400">{shot.intent}</p>
              {shot.error ? <p className="mt-1.5 text-xs text-terracotta-400">{shot.error}</p> : null}
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}

/**
 * Why this prompt.
 *
 * The workshop for this track made the point plainly: a higher score does not prove memory caused
 * the improvement — you have to look at the knowledge the next prompt actually used. This is that
 * look. Every clause sent to the provider is listed with what it came from, and a clause learned
 * from an earlier attempt says which attempt and which criterion it was meant to fix.
 *
 * Learned clauses are pulled to the top by default, because they are the difference between this
 * attempt and the last one, and burying them under a dozen unchanged constraints hides the evidence.
 */
function WhyThisPrompt({ run, project }: { run: Run; project: Project }) {
  const [showAll, setShowAll] = useState(false);
  const basePrompt = run.basePrompt;

  const { clauses, learned, rest } = useMemo(() => {
    const all = basePrompt?.clauses ?? [];
    return {
      clauses: all,
      learned: all.filter((c) => c.sourceKind === "lesson"),
      rest: all.filter((c) => c.sourceKind !== "lesson"),
    };
  }, [basePrompt]);

  if (clauses.length === 0) return null;

  const visible = showAll ? [...learned, ...rest] : learned.length > 0 ? learned : rest.slice(0, 4);

  return (
    <Card className="p-4">
      <SectionTitle hint={`${clauses.length} clauses`}>Why this prompt</SectionTitle>

      {run.memoryWithheld ? (
        <p className="mb-3 rounded border border-terracotta-500/40 bg-terracotta-900 px-3 py-2 text-xs text-terracotta-400">
          Control run. The canon was deliberately withheld, so nothing below came from learned
          knowledge. That is what makes the paired score meaningful.
        </p>
      ) : learned.length === 0 ? (
        <p className="mb-3 text-xs text-bone-500">
          Nothing learned has been accepted into the canon yet, so this prompt is the brief and its
          constraints alone.
        </p>
      ) : (
        <p className="mb-3 text-xs text-bone-400">
          <span className="text-bronze-300">{learned.length}</span> of {clauses.length} clauses came
          from knowledge this project proved and you accepted.
        </p>
      )}

      <ol className="grid gap-2">
        {visible.map((clause) => (
          <ClauseRow key={clause.index} clause={clause} project={project} />
        ))}
      </ol>

      {clauses.length > visible.length ? (
        <button
          onClick={() => setShowAll(true)}
          className="mt-3 font-mono text-[11px] uppercase tracking-wider text-bone-500 transition-colors hover:text-bone-200"
        >
          show all {clauses.length} clauses
        </button>
      ) : null}

      <p className="mt-4 border-t border-basalt-800 pt-3 font-mono text-[10px] text-bone-500">
        prompt sha256 · {run.basePrompt?.promptHash.slice(0, 16)}
      </p>
    </Card>
  );
}

function ClauseRow({ clause, project }: { clause: Clause; project: Project }) {
  const learned = clause.sourceKind === "lesson";
  const criterion =
    clause.criterionIndex !== undefined
      ? project.brief.criteria.find((c) => c.index === clause.criterionIndex)
      : undefined;

  return (
    <li
      className={`rounded border px-3 py-2 ${
        learned ? "border-bronze-400/30 bg-bronze-900/40" : "border-basalt-800 bg-basalt-950"
      }`}
    >
      <p className="text-sm text-bone-200">{clause.body}</p>
      <p className="mt-1.5 font-mono text-[10px] uppercase tracking-wider text-bone-500">
        {learned ? (
          <span className="text-bronze-300">
            learned · attempt {clause.sourceAttempt ?? "?"}
            {isForeign(clause.originProjectId, project.id) ? " · inherited" : ""}
          </span>
        ) : (
          <span>{clause.sourceKind === "brief" ? "from the brief" : "constraint"}</span>
        )}
      </p>
      {criterion ? (
        // Set apart rather than folded into the uppercase meta line: the criterion is the author's
        // own words, and shouting them back makes the clause harder to read, not easier.
        <p className="mt-1 text-[11px] text-bone-500">
          fixes “<span className="text-bone-400">{criterion.body}</span>”
        </p>
      ) : null}
    </li>
  );
}

/**
 * Did this lesson come from somewhere else?
 *
 * Runs recorded before the compiler normalised it stored a full IRI here rather than a bare id, and
 * a plain equality check reads those as foreign and mislabels a project's own knowledge as
 * inherited. Comparing the last path segment reads both shapes correctly, and history stays honest
 * without rewriting it.
 */
function isForeign(originProjectId: string | undefined, projectId: string): boolean {
  if (!originProjectId) return false;
  return (originProjectId.split("/").filter(Boolean).pop() ?? originProjectId) !== projectId;
}

/**
 * Every call this attempt made to the network, with what it cost.
 *
 * The figures are the network's own `cost_usd_estimated`, not a local price table — so this is what
 * was actually billed rather than what we guessed it would be.
 */
function Ledger({ run }: { run: Run }) {
  const [open, setOpen] = useState(false);
  if (run.calls.length === 0) return null;

  const byCapability = run.calls.reduce<Record<string, { count: number; usd: number; failures: number }>>(
    (acc, call) => {
      const entry = (acc[call.capability] ??= { count: 0, usd: 0, failures: 0 });
      entry.count++;
      entry.usd += call.costUSD;
      if (!call.ok) entry.failures++;
      return acc;
    },
    {}
  );

  const warnings = run.calls.flatMap((call) => call.warnings.map((w) => ({ capability: call.capability, ...w })));

  return (
    <Card className="p-4">
      <SectionTitle hint={<Money usd={run.costUSD} />}>Network ledger</SectionTitle>

      <ul className="grid gap-1.5">
        {Object.entries(byCapability)
          .sort((a, b) => b[1].usd - a[1].usd)
          .map(([capability, entry]) => (
            <li key={capability} className="flex items-baseline justify-between gap-3 font-mono text-[11px]">
              <span className="truncate text-bone-300">{capability}</span>
              <span className="shrink-0 text-bone-500">
                ×{entry.count}
                {entry.failures > 0 ? <span className="text-terracotta-400"> ·{entry.failures} failed</span> : null}{" "}
                <Money usd={entry.usd} />
              </span>
            </li>
          ))}
      </ul>

      {warnings.length > 0 ? (
        <div className="mt-3 rounded border border-bronze-400/30 bg-bronze-900/40 px-3 py-2">
          <p className="font-mono text-[10px] uppercase tracking-wider text-bronze-300">
            the network dropped {warnings.length} parameter{warnings.length === 1 ? "" : "s"}
          </p>
          {warnings.slice(0, 3).map((warning, index) => (
            <p key={index} className="mt-1 text-[11px] text-bone-400">
              {warning.message}
            </p>
          ))}
        </div>
      ) : null}

      <button
        onClick={() => setOpen(!open)}
        className="mt-3 font-mono text-[11px] uppercase tracking-wider text-bone-500 transition-colors hover:text-bone-200"
      >
        {open ? "hide" : "show"} all {run.calls.length} calls
      </button>

      {open ? (
        <ul className="mt-2 grid max-h-64 gap-1 overflow-y-auto font-mono text-[10px]">
          {run.calls.map((call) => (
            <li key={call.id} className="flex items-baseline justify-between gap-2">
              <span className={`truncate ${call.ok ? "text-bone-400" : "text-terracotta-400"}`}>
                {call.stage} · {call.capability}
              </span>
              <span className="shrink-0 text-bone-500">
                {(call.latencyMs / 1000).toFixed(1)}s <Money usd={call.costUSD} />
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
