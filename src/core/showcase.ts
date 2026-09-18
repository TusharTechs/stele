import { listProjects } from "./store";
import type { Clause, Project, Run } from "./schemas";

/**
 * The strongest before-and-after this instance can actually show.
 *
 * The landing page argues that remembered knowledge makes the next render better. Arguing it in
 * prose is cheap; the honest version is to put the two cuts side by side and let someone watch. So
 * this looks through real project history for a pair worth showing — a first attempt that knew
 * nothing, and a later one steered by lessons the first attempt taught — and returns nothing at all
 * when no such pair exists yet, rather than inventing one.
 */

export interface ClipRef {
  attempt: number;
  score: number;
  url: string;
  summary: string;
  /** The shot's own keyframe, used as the video poster so the panel is not two black rectangles. */
  posterUrl?: string;
}

export interface Showcase {
  project: Pick<Project, "id" | "title">;
  goal: string;
  before: ClipRef;
  after: ClipRef;
  /** The clauses present in the later run and absent from the earlier one — the actual difference. */
  learned: Clause[];
  /** How many criteria went from failing to passing. The honest headline. */
  criteriaFixed: number;
  /** Set when the learned knowledge came from a different production entirely. */
  inherited: boolean;
}

export async function findShowcase(): Promise<Showcase | undefined> {
  const projects = await listProjects();

  let best: { showcase: Showcase; rank: number } | undefined;

  for (const project of projects) {
    const complete = project.runs.filter(
      (run): run is Run & { review: NonNullable<Run["review"]>; cutUrl: string } =>
        run.stage === "COMPLETE" && Boolean(run.review) && Boolean(run.cutUrl)
    );

    // The pair has to differ in the one variable being claimed: the earlier run compiled without
    // learned knowledge, the later one with it. A control run is excluded from the "after" slot —
    // its whole point is that it withheld memory.
    const before = complete.find((run) => (run.basePrompt?.memoryClauseCount ?? 0) === 0);
    const after = complete
      .filter((run) => !run.memoryWithheld && (run.basePrompt?.memoryClauseCount ?? 0) > 0)
      .at(-1);

    if (!before || !after || after.attempt <= before.attempt) continue;

    const learned = (after.basePrompt?.clauses ?? []).filter((clause) => clause.sourceKind === "lesson");
    const criteriaFixed = before.review.verdicts.filter(
      (v) => !v.met && after.review.verdicts.some((w) => w.index === v.index && w.met)
    ).length;

    // Ranked on criteria repaired before score, because that is the claim actually being made. A
    // score is one model's single number on a coarse scale; "two criteria this failed now pass" is
    // the specific, checkable thing, and a pair can fix real faults without the number moving.
    const rank = criteriaFixed * 10 + (after.review.score - before.review.score);
    if (best && rank <= best.rank) continue;

    best = {
      rank,
      showcase: {
        project: { id: project.id, title: project.title },
        goal: project.brief.goal,
        before: clipRef(before),
        after: clipRef(after),
        learned,
        criteriaFixed,
        inherited: learned.some((c) => c.originProjectId && c.originProjectId !== project.id),
      },
    };
  }

  return best?.showcase;
}

function clipRef(run: Run & { review: NonNullable<Run["review"]>; cutUrl: string }): ClipRef {
  return {
    attempt: run.attempt,
    score: run.review.score,
    url: run.cutUrl,
    summary: run.review.summary,
    posterUrl: run.shots.find((shot) => shot.keyframeUrl)?.keyframeUrl,
  };
}
