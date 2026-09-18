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
  /** Out of how many, because "2 repaired" means something different against 3 than against 12. */
  criteriaTotal: number;
  /**
   * The productions the inherited rules were proved on, named so the claim can be followed up.
   *
   * Resolved from the project list rather than read off the clause: a clause carries the origin's
   * id reliably and its title only sometimes, and a panel that says "carried over from undefined"
   * is worse than one that says nothing.
   */
  originTitles: string[];
  /** Set when the learned knowledge came from a different production entirely. */
  inherited: boolean;
}

export async function findShowcase(): Promise<Showcase | undefined> {
  const projects = await listProjects();
  const titles = new Map(projects.map((project) => [project.id, project.title]));

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
        criteriaTotal: before.review.verdicts.length,
        originTitles: originTitlesFor(learned, project.id, titles),
        inherited: learned.some((c) => c.originProjectId && c.originProjectId !== project.id),
      },
    };
  }

  return best?.showcase;
}

/** The other productions that contributed a clause here, in the order they first appear, deduped. */
function originTitlesFor(learned: Clause[], selfId: string, titles: Map<string, string>): string[] {
  const found: string[] = [];
  for (const clause of learned) {
    const origin = clause.originProjectId;
    if (!origin || origin === selfId) continue;
    // The graph stores an IRI where the file store keeps a bare id, so match on either.
    const title = titles.get(origin) ?? titles.get(origin.split("/").pop() ?? "");
    if (title && !found.includes(title)) found.push(title);
  }
  return found;
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

/**
 * Media for the landing page, chosen rather than dumped.
 *
 * Everything here is this instance's own output. A landing page for a product about provenance that
 * ran on stock footage would be a joke at its own expense, so if nothing has been rendered the
 * cinematic treatment simply does not appear and the page falls back to type.
 */
export interface Cinematic {
  /** The ambient clip behind the hero: the highest-scoring cut there is. */
  hero?: { url: string; posterUrl?: string; title: string; score: number };
  /** A strip of shots, one per production, so the run reads as range rather than repetition. */
  strip: Array<{ url: string; posterUrl?: string; projectId: string; title: string; intent: string }>;
  stills: Array<{ url: string; projectId: string; title: string }>;
  counts: { productions: number; shots: number; frames: number };
}

export async function buildCinematic(): Promise<Cinematic> {
  const projects = await listProjects();

  let hero: Cinematic["hero"];
  const strip: Cinematic["strip"] = [];
  const stills: Cinematic["stills"] = [];
  let shots = 0;
  let frames = 0;

  for (const project of projects) {
    for (const run of project.runs) {
      for (const shot of run.shots) {
        if (shot.videoUrl) shots++;
        if (shot.keyframeUrl) frames++;
      }
    }

    const best = project.runs
      .filter((r) => r.cutUrl && r.review)
      .sort((a, b) => (b.review?.score ?? 0) - (a.review?.score ?? 0))[0];
    if (!best?.cutUrl || !best.review) continue;

    const poster = best.shots.find((s) => s.keyframeUrl)?.keyframeUrl;
    if (!hero || best.review.score > hero.score) {
      hero = { url: best.cutUrl, posterUrl: poster, title: project.title, score: best.review.score };
    }

    // One shot per production keeps the strip varied; six in a row from the same film reads as a bug.
    const shot = best.shots.find((s) => s.videoUrl);
    if (shot?.videoUrl) {
      strip.push({
        url: shot.videoUrl,
        posterUrl: shot.keyframeUrl,
        projectId: project.id,
        title: project.title,
        intent: shot.intent,
      });
    }

    for (const frame of best.shots.filter((s) => s.keyframeUrl).slice(0, 2)) {
      stills.push({ url: frame.keyframeUrl!, projectId: project.id, title: project.title });
    }
  }

  return {
    hero,
    strip: strip.slice(0, 6),
    stills: stills.slice(0, 10),
    counts: { productions: projects.filter((p) => p.runs.length > 0).length, shots, frames },
  };
}
