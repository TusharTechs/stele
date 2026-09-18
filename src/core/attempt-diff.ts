import type { Clause, Project, Run } from "./schemas";

/**
 * What changed between two attempts.
 *
 * The workshop for this track put the objection plainly: a higher score does not show that memory
 * caused it, and you have to look at the knowledge the next prompt actually used. This is that
 * comparison, and it is deliberately built from each run's compiled clause list rather than from
 * snapshots of the canon.
 *
 * The distinction matters. A canon snapshot says what the project *knew* at a moment. A clause list
 * says what was *sent to the provider*, which is the only thing that can have changed the output. A
 * lesson that was accepted but deduplicated away never reached the render, and a diff that counted
 * it would be describing a cause that never acted.
 */

export interface ClauseChange {
  clause: Clause;
  /** Where the clause came from, phrased for someone reading the diff cold. */
  origin: string;
}

export interface CriterionChange {
  index: number;
  body: string;
  before: boolean;
  after: boolean;
}

export interface AttemptDiff {
  from: number;
  to: number;
  added: ClauseChange[];
  removed: ClauseChange[];
  /** Criteria whose verdict moved in either direction. */
  fixed: CriterionChange[];
  broken: CriterionChange[];
  scoreBefore?: number;
  scoreAfter?: number;
  costBefore: number;
  costAfter: number;
  /** True when the later attempt deliberately ran without the canon. */
  toWasControl: boolean;
}

export function diffAttempts(project: Project, from: Run, to: Run): AttemptDiff {
  const before = from.basePrompt?.clauses ?? [];
  const after = to.basePrompt?.clauses ?? [];

  // Compared on normalised text, not index or id. A clause that moved position is the same clause,
  // and reporting it as removed-and-added would bury the one line that actually changed.
  const beforeKeys = new Set(before.map((c) => key(c)));
  const afterKeys = new Set(after.map((c) => key(c)));

  const added = after.filter((c) => !beforeKeys.has(key(c))).map((c) => describe(c, project));
  const removed = before.filter((c) => !afterKeys.has(key(c))).map((c) => describe(c, project));

  const fixed: CriterionChange[] = [];
  const broken: CriterionChange[] = [];

  for (const criterion of project.brief.criteria) {
    const b = from.review?.verdicts.find((v) => v.index === criterion.index);
    const a = to.review?.verdicts.find((v) => v.index === criterion.index);
    if (!b || !a || b.met === a.met) continue;

    const change: CriterionChange = { index: criterion.index, body: criterion.body, before: b.met, after: a.met };
    (a.met ? fixed : broken).push(change);
  }

  return {
    from: from.attempt,
    to: to.attempt,
    added,
    removed,
    fixed,
    broken,
    scoreBefore: from.review?.score,
    scoreAfter: to.review?.score,
    costBefore: from.costUSD,
    costAfter: to.costUSD,
    toWasControl: to.memoryWithheld,
  };
}

/**
 * The most informative pair to show for a given attempt.
 *
 * Its immediate predecessor, unless that predecessor never finished — an attempt that failed at
 * RENDERING has no clause list worth comparing against, and diffing an empty one would report every
 * clause as newly added.
 */
export function previousComparable(project: Project, run: Run): Run | undefined {
  return project.runs
    .filter((r) => r.attempt < run.attempt && r.basePrompt && r.stage === "COMPLETE")
    .at(-1);
}

function describe(clause: Clause, project: Project): ClauseChange {
  if (clause.sourceKind === "brief") return { clause, origin: "from the brief" };
  if (clause.sourceKind === "constraint") return { clause, origin: "a constraint you set" };

  const foreign = clause.originProjectId && clause.originProjectId !== project.id;
  const where = foreign
    ? `inherited from ${clause.originProjectTitle ?? "another production"}`
    : `learned on attempt ${clause.sourceAttempt ?? "?"}`;

  const criterion =
    clause.criterionIndex !== undefined
      ? project.brief.criteria.find((c) => c.index === clause.criterionIndex)
      : undefined;

  return { clause, origin: criterion ? `${where}, to fix “${criterion.body}”` : where };
}

function key(clause: Clause): string {
  return clause.body.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}
