import { z } from "zod";
import { LivepeerAgent, livepeer, type LivepeerCall } from "@/livepeer/mcp-client";
import {
  CAPABILITY,
  animateKeyframe,
  concatClips,
  groundFromUrl,
  deriveKeyframe,
  makeKeyframe,
  muxAudio,
  narrate,
  scoreMusic,
  snapDuration,
  think,
} from "@/livepeer/capabilities";
import { knowledgeStore, type KnowledgeStore } from "@/dkg/client";
import { contentHash } from "@/dkg/ontology";
import { safeSourceUrl, safeText } from "@/dkg/redact";
import { compilePrompt, extendForShot } from "./compiler";
import { reviewVideo } from "./reviewer";
import { distillLessons } from "./distiller";
import { loadProject, updateProject } from "./store";
import {
  ShotPlanSchema,
  type Project,
  type Run,
  type RunStage,
  type ShotPlan,
  type ShotRecord,
} from "./schemas";

/**
 * One attempt at a production, start to finish.
 *
 * The loop is: read what the project knows → plan shots → render each shot and review it → assemble
 * a cut → review the cut → distil what was learned → write it all back to the graph.
 *
 * Two properties are worth stating plainly, because they are the difference between a demo and
 * something that survives contact with a real network.
 *
 * **Every stage persists before the next begins.** Video renders take minutes and the process will
 * be interrupted — by a restart, a dropped connection, a laptop lid. Re-entering a run skips what
 * already completed rather than paying to redo it, and idempotency keys mean a re-dispatched job
 * replays rather than re-bills.
 *
 * **The shot review is a gate.** A shot the reviewer rejects is rendered again against the same
 * knowledge plus the reason it failed, bounded, so one stubborn shot cannot consume the budget. A
 * gate that never stops anything is a report, and a report changes nothing.
 */

export type PipelineEvent =
  | { type: "stage"; stage: RunStage; detail?: string }
  | { type: "shot"; index: number; status: ShotRecord["status"]; detail?: string; url?: string }
  | { type: "call"; call: LivepeerCall }
  | { type: "cost"; totalUSD: number }
  | { type: "done"; attempt: number; score?: number }
  | { type: "error"; message: string };

export interface RunOptions {
  projectId: string;
  /** Compile from the brief alone. The control condition of the paired experiment. */
  withholdMemory?: boolean;
  /** Set on the control run so the pair can be joined in the graph and the UI. */
  pairedWithAttempt?: number;
  onEvent?: (event: PipelineEvent) => void;
}

/** Ceiling for one attempt. A stage that would cross it stops the run instead of spending through it. */
const DEFAULT_BUDGET_USD = Number(process.env.STELE_RUN_BUDGET_USD ?? 8);

/** How many times a single shot may be re-rendered after a failed review. */
const MAX_SHOT_ATTEMPTS = 2;

export class BudgetExceeded extends Error {}

export async function runProduction(options: RunOptions): Promise<Run> {
  const { projectId, withholdMemory = false, pairedWithAttempt, onEvent } = options;

  const existing = await loadProject(projectId);
  if (!existing) throw new Error(`No project ${projectId}.`);

  const agent = livepeer();
  const store = knowledgeStore();
  const emit = (event: PipelineEvent) => onEvent?.(event);

  // A fresh attempt number every time: attempts are history, never overwritten.
  const attempt = existing.runs.length + 1;
  const ctx: RunContext = {
    projectId,
    attempt,
    agent,
    store,
    emit,
    budgetUSD: DEFAULT_BUDGET_USD,
    spentUSD: 0,
    ledgerStart: agent.ledger().length,
    baselineUSD: agent.totalCostUSD(),
  };

  let run: Run = {
    attempt,
    startedAt: Date.now(),
    stage: "QUEUED",
    memoryWithheld: withholdMemory,
    canonVersion: existing.canonVersion,
    shots: [],
    lessonIds: [],
    costUSD: 0,
    calls: [],
    pairedWithAttempt,
  };
  await persist(ctx, run, (project) => ({ ...project, runs: [...project.runs, run] }));

  try {
    const project = existing;

    // 1. Grounding — optional, and never fatal. A page that will not load is a fact about the page.
    if (project.brief.groundingUrl) {
      run = await stage(ctx, run, "GROUNDING", async () => {
        await ground(ctx, project);
      });
    }

    // 2. Compile the prompt from the graph. This is the stage the whole project is about.
    let basePrompt = run.basePrompt;
    run = await stage(ctx, run, "COMPILING", async () => {
      const compiled = await compilePrompt({ project, store, withholdMemory });
      basePrompt = compiled.prompt;
      run.basePrompt = compiled.prompt;
      // Constraints and lessons both arrive from the graph, but only lessons are *learned* — so the
      // two are counted separately. Conflating them would overstate what the loop has figured out.
      const fromGraph = compiled.prompt.clauses.filter((c) => c.sourceKind !== "brief").length;
      ctx.emit({
        type: "stage",
        stage: "COMPILING",
        detail: withholdMemory
          ? "Memory withheld. Compiling from the brief alone (control run)."
          : `${fromGraph} of ${compiled.prompt.clauses.length} clauses came from the graph, ${compiled.prompt.memoryClauseCount} of them learned from earlier attempts (${compiled.rowCount} rows via ${compiled.servedBy}, ${compiled.queryMs}ms).`,
      });
    });
    if (!basePrompt) throw new Error("The prompt compiler produced nothing.");

    // 3. Plan the shots, conditioned on the compiled knowledge rather than the raw brief.
    let plans: ShotPlan[] = [];
    run = await stage(ctx, run, "PLANNING", async () => {
      plans = await planShots(ctx, project, basePrompt!.text);
    });

    // 4. Render and gate each shot, anchored to the first shot's frame.
    run = await stage(ctx, run, "RENDERING", async () => {
      run.shots = [];
      let anchorUrl: string | undefined;

      for (const plan of plans) {
        const shot = await renderShotWithGate(ctx, project, plan, basePrompt!, anchorUrl);
        run.shots.push(shot);
        // The first shot that produces a frame becomes the film's visual anchor; every later shot
        // is an edit of it. Measured before this existed: three independently generated shots gave
        // three different clock faces and three different lighting setups, and the canon's rules
        // about consistency could not be obeyed because nothing carried between renders.
        anchorUrl ??= shot.keyframeUrl;
        await persist(ctx, run, replaceRun(run));
      }
    });

    const usable = run.shots.filter((shot) => shot.videoUrl);
    if (usable.length === 0) throw new Error("No shot produced usable footage.");

    // 5. Assemble: cut the shots together, then lay narration and score over the cut.
    run = await stage(ctx, run, "ASSEMBLING", async () => {
      await assemble(ctx, project, run, usable);
    });

    // 6. Review the finished cut — the score that drives the loop.
    run = await stage(ctx, run, "REVIEWING", async () => {
      if (!run.cutUrl) throw new Error("There is no cut to review.");
      try {
        run.review = await reviewVideo({
          agent,
          brief: project.brief,
          videoUrl: run.cutUrl,
          stage: `review:attempt-${attempt}`,
        });
        ctx.emit({
          type: "stage",
          stage: "REVIEWING",
          detail: `Scored ${run.review.score}/10 against a target of ${project.brief.targetScore}.`,
        });
      } catch (error) {
        // The review costs about a cent and arrives after every expensive stage has succeeded.
        // Failing the attempt here would discard a finished film over the cheapest call in the run.
        // The attempt stands, unscored and labelled as such; it teaches the loop nothing, which is
        // the honest consequence rather than a guessed score.
        run.reviewError = short(error);
        ctx.emit({
          type: "stage",
          stage: "REVIEWING",
          detail: `The cut is finished but could not be reviewed: ${run.reviewError}`,
        });
      }
    });

    // 7. Learn. A control run deliberately contributes nothing: its whole purpose is to show what
    //    happens without the canon, so letting it write back would contaminate the comparison.
    run = await stage(ctx, run, "LEARNING", async () => {
      if (withholdMemory) {
        ctx.emit({ type: "stage", stage: "LEARNING", detail: "Control run. Nothing written to the canon." });
        return;
      }
      await learn(ctx, run);
    });

    run.stage = "COMPLETE";
    run.finishedAt = Date.now();
    run.costUSD = ctx.spentUSD;
    run.calls = callsFor(ctx);
    await persist(ctx, run, replaceRun(run));
    await writeGraph(ctx.projectId, store);

    emit({ type: "done", attempt, score: run.review?.score });
    return run;
  } catch (error) {
    run.stage = "FAILED";
    run.error = safeText(error instanceof Error ? error.message : String(error), 500);
    run.finishedAt = Date.now();
    run.costUSD = ctx.spentUSD;
    run.calls = callsFor(ctx);
    await persist(ctx, run, replaceRun(run));
    // Partial work is still evidence, and a failed attempt is part of the record.
    await writeGraph(ctx.projectId, store).catch(() => undefined);
    emit({ type: "error", message: run.error });
    return run;
  }
}

// ---------------------------------------------------------------- stages

interface RunContext {
  projectId: string;
  attempt: number;
  agent: LivepeerAgent;
  store: KnowledgeStore;
  emit: (event: PipelineEvent) => void;
  budgetUSD: number;
  spentUSD: number;
  /** The agent's cumulative spend when this run started, so the budget measures only this run. */
  baselineUSD: number;
  /**
   * Where this run's calls begin in the agent's ledger.
   *
   * The Livepeer client is a process singleton, so its ledger accumulates across every run the
   * process performs. Without this offset a run records every call the process ever made — six
   * productions in one script attributed all of their spend to each of them — and the per-run
   * budget guard is really a per-process one, which trips on every run after the first few and
   * fails them at zero spend.
   */
  ledgerStart: number;
}

async function stage(
  ctx: RunContext,
  run: Run,
  name: RunStage,
  work: () => Promise<void>
): Promise<Run> {
  run.stage = name;
  ctx.emit({ type: "stage", stage: name });
  await persist(ctx, run, replaceRun(run));

  const before = ctx.agent.totalCostUSD();
  await work();
  ctx.spentUSD += ctx.agent.totalCostUSD() - before;
  run.costUSD = ctx.spentUSD;
  ctx.emit({ type: "cost", totalUSD: ctx.spentUSD });

  await persist(ctx, run, replaceRun(run));
  return run;
}

/**
 * Reads a page the film is supposed to stay faithful to.
 *
 * Only the fact of retrieval is kept: the URL, when it was fetched, and a hash of what came back.
 * The page's text itself is not written to the graph — it is someone else's content, and a
 * provenance record should point at a source rather than mirror it.
 */
async function ground(ctx: RunContext, project: Project): Promise<void> {
  const url = safeSourceUrl(project.brief.groundingUrl);
  if (!url) {
    ctx.emit({ type: "stage", stage: "GROUNDING", detail: "Grounding URL rejected. https only." });
    return;
  }

  const result = await groundFromUrl(ctx.agent, `ground:attempt-${ctx.attempt}`, url);
  await updateProject(ctx.projectId, (current) => ({
    ...current,
    sources: [
      ...current.sources.filter((s) => s.url !== url),
      {
        url,
        retrievedAt: Date.now(),
        excerptHash: contentHash(result.text || url),
        claimCount: result.ok ? countSentences(result.text) : 0,
        ok: result.ok,
      },
    ],
  }));

  ctx.emit({
    type: "stage",
    stage: "GROUNDING",
    detail: result.ok ? `Retrieved ${result.text.length} characters from the source.` : "Source could not be retrieved; continuing without it.",
  });
}

const ShotPlanResponseSchema = z.object({ shots: z.array(ShotPlanSchema).min(1).max(8) });

async function planShots(ctx: RunContext, project: Project, compiledKnowledge: string): Promise<ShotPlan[]> {
  const { brief } = project;
  const duration = snapDuration(brief.shotSeconds);

  const prompt = [
    `Plan exactly ${brief.shotCount} shots for a short film.`,
    "",
    "The direction below is already compiled from this production's canon. Treat it as binding:",
    compiledKnowledge,
    "",
    "It must satisfy these criteria:",
    ...brief.criteria.map((c) => `  ${c.index}. ${c.body}`),
    "",
    "For each shot give:",
    "  intent: one sentence on what this shot is for in the film.",
    "  keyframeBrief: a still-image prompt for the opening frame. Concrete and visual: subject, framing, light, colour, lens feel. No camera movement here.",
    "  motion: how the shot moves once animated. One short phrase, e.g. 'slow dolly in, steam rising'.",
    `  seconds: must be exactly ${duration}.`,
    "",
    "The shots must read as one continuous piece: same world, same palette, same subject treatment.",
    "Index them from 0.",
    "",
    `Return: {"shots": [{"index": 0, "intent": "...", "keyframeBrief": "...", "motion": "...", "seconds": ${duration}}]}`,
  ].join("\n");

  const { value } = await think(ctx.agent, `plan:attempt-${ctx.attempt}`, prompt, ShotPlanResponseSchema);

  // The model is asked for a shot count and a duration, and mostly complies. Neither is left to
  // chance: the count drives the cost estimate the user approved, and the duration must be one of
  // the discrete values the video capability accepts or the provider coerces it silently.
  return value.shots
    .slice(0, brief.shotCount)
    .map((shot, index) => ({ ...shot, index, seconds: duration }));
}

/**
 * Render one shot, review it, and re-render if the review rejects it.
 *
 * The retry is not a blind repeat: the reviewer's reason for rejecting joins the prompt, so the
 * second attempt is told what was wrong with the first. Bounded at `MAX_SHOT_ATTEMPTS`, and a shot
 * that still fails is kept rather than discarded — its footage is usually usable and its failure is
 * the evidence the next production attempt learns from.
 */
async function renderShotWithGate(
  ctx: RunContext,
  project: Project,
  plan: ShotPlan,
  basePrompt: Parameters<typeof extendForShot>[0],
  /** The film's anchor frame. Absent for the first shot, which establishes it. */
  anchorUrl?: string
): Promise<ShotRecord> {
  const shotPrompt = extendForShot(basePrompt, plan);
  const shot: ShotRecord = {
    index: plan.index,
    intent: plan.intent,
    prompt: shotPrompt,
    motionPrompt: plan.motion,
    capability: CAPABILITY.animate,
    costUSD: 0,
    attempts: 0,
    status: "pending",
  };

  let correction = "";

  for (let tryNumber = 1; tryNumber <= MAX_SHOT_ATTEMPTS; tryNumber++) {
    shot.attempts = tryNumber;
    assertBudget(ctx);

    try {
      ctx.emit({ type: "shot", index: plan.index, status: "rendering" });
      shot.status = "rendering";

      const keyframePrompt = correction ? `${shotPrompt.text} ${correction}` : shotPrompt.text;
      const key = `stele-${ctx.projectId}-${ctx.attempt}-${plan.index}-${tryNumber}`;

      // The first shot is generated; every later one is an edit of it, so the subject, surface and
      // lighting carry structurally rather than being re-requested and re-invented each time.
      const keyframe = anchorUrl
        ? await deriveKeyframe(
            ctx.agent,
            `keyframe:${ctx.attempt}.${plan.index}`,
            editInstruction(plan, correction),
            anchorUrl,
            `${key}-kf`
          )
        : await makeKeyframe(ctx.agent, `keyframe:${ctx.attempt}.${plan.index}`, keyframePrompt, `${key}-kf`);
      shot.keyframeUrl = keyframe.url;
      shot.keyframeCapability = keyframe.capability;
      shot.anchoredTo = anchorUrl;
      ctx.emit({ type: "shot", index: plan.index, status: "rendering", detail: "keyframe ready", url: keyframe.url });

      const video = await animateKeyframe(
        ctx.agent,
        `animate:${ctx.attempt}.${plan.index}`,
        plan.motion,
        keyframe.url,
        plan.seconds,
        `${key}-vid`
      );
      shot.videoUrl = video.url;
      shot.capability = video.capability;

      ctx.emit({ type: "shot", index: plan.index, status: "reviewing", url: video.url });
      shot.status = "reviewing";

      shot.review = await reviewVideo({
        agent: ctx.agent,
        brief: project.brief,
        videoUrl: video.url,
        stage: `review:${ctx.attempt}.${plan.index}`,
        shotIntent: plan.intent,
      });

      if (shot.review.passed || tryNumber === MAX_SHOT_ATTEMPTS) {
        shot.status = shot.review.passed ? "passed" : "failed";
        ctx.emit({
          type: "shot",
          index: plan.index,
          status: shot.status,
          url: video.url,
          detail: `${shot.review.score}/10 · ${shot.review.summary}`,
        });
        return shot;
      }

      // Rejected with a retry left: carry the reason forward rather than rolling the dice again.
      const problems = shot.review.findings.filter((f) => f.polarity === "negative").map((f) => f.body);
      correction = problems.length ? `Correct these problems from the previous attempt: ${problems.join("; ")}` : "";
      ctx.emit({
        type: "shot",
        index: plan.index,
        status: "failed",
        detail: `${shot.review.score}/10 · re-rendering with the reviewer's notes.`,
      });
    } catch (error) {
      shot.error = safeText(error instanceof Error ? error.message : String(error), 300);
      if (tryNumber === MAX_SHOT_ATTEMPTS) {
        shot.status = "failed";
        ctx.emit({ type: "shot", index: plan.index, status: "failed", detail: shot.error });
        return shot;
      }
    }
  }

  shot.status = "failed";
  return shot;
}

/**
 * Cuts the shots together and lays audio over the result.
 *
 * Every step happens on the network — concatenation, narration, score, mux — so there is no local
 * ffmpeg and nothing to install. Audio is best-effort by design: a film with no narration is still
 * a film, and failing the whole production because a text-to-speech call timed out would throw away
 * minutes of successful video renders.
 */
async function assemble(ctx: RunContext, project: Project, run: Run, shots: ShotRecord[]): Promise<void> {
  const clips = shots.map((shot) => shot.videoUrl!).filter(Boolean);

  let cut = clips[0];
  if (clips.length > 1) {
    try {
      cut = (await concatClips(ctx.agent, `concat:attempt-${ctx.attempt}`, clips)).url;
      ctx.emit({ type: "stage", stage: "ASSEMBLING", detail: `Cut ${clips.length} shots together.` });
    } catch (error) {
      // The network publishes this capability's success rate, and it is 84%. Building as though it
      // were 100% meant roughly one run in six threw away every shot it had just paid minutes and
      // dollars to render. The shots are the expensive part and they already exist; falling back to
      // the first one keeps the attempt, its footage and its record, and says plainly what happened.
      run.assemblyNote = `Shots could not be cut together (${short(error)}). Using shot 0 as the cut. All ${clips.length} shots are kept and downloadable.`;
      ctx.emit({ type: "stage", stage: "ASSEMBLING", detail: run.assemblyNote });
    }
  }

  if (project.brief.narration) {
    try {
      const script = await writeNarration(ctx, project, shots);
      const voice = await narrate(ctx.agent, `narrate:attempt-${ctx.attempt}`, script);
      run.narrationUrl = voice.url;
      cut = (await muxAudio(ctx.agent, `mux:attempt-${ctx.attempt}`, cut, voice.url)).url;
      ctx.emit({ type: "stage", stage: "ASSEMBLING", detail: "Narration recorded and laid over the cut." });
    } catch (error) {
      ctx.emit({ type: "stage", stage: "ASSEMBLING", detail: `Narration skipped: ${short(error)}` });
    }
  } else if (project.brief.music) {
    // Only one audio bed is laid down: `ffmpeg-mux` replaces a clip's audio rather than mixing into
    // it, so running both would silently discard the narration.
    try {
      const music = await scoreMusic(
        ctx.agent,
        `score:attempt-${ctx.attempt}`,
        `Instrumental score for: ${project.brief.goal}. ${project.brief.styleNote}. No vocals, no speech.`,
        cut
      );
      run.musicUrl = music.url;
      cut = (await muxAudio(ctx.agent, `mux:attempt-${ctx.attempt}`, cut, music.url)).url;
      ctx.emit({ type: "stage", stage: "ASSEMBLING", detail: "Score composed and laid over the cut." });
    } catch (error) {
      ctx.emit({ type: "stage", stage: "ASSEMBLING", detail: `Score skipped: ${short(error)}` });
    }
  }

  run.cutUrl = cut;
}

const NarrationSchema = z.object({ script: z.string().min(10).max(700) });

async function writeNarration(ctx: RunContext, project: Project, shots: ShotRecord[]): Promise<string> {
  // Roughly 15 spoken words per 6 seconds of footage; over-writing produces narration that runs
  // past the picture and gets clipped by the mux.
  const seconds = shots.length * project.brief.shotSeconds;
  const words = Math.max(12, Math.round(seconds * 2.4));

  const { value } = await think(
    ctx.agent,
    `narration:attempt-${ctx.attempt}`,
    [
      `Write voiceover for a ${seconds}-second film. About ${words} words. That is a hard ceiling, not a target.`,
      `The film: ${project.brief.goal}`,
      project.brief.audience ? `Audience: ${project.brief.audience}` : "",
      "",
      "The shots, in order:",
      ...shots.map((s) => `  ${s.index}. ${s.intent}`),
      "",
      "Plain spoken sentences only. No stage directions, no shot numbers, no speaker labels, no markdown.",
      'Return: {"script": "..."}',
    ]
      .filter(Boolean)
      .join("\n"),
    NarrationSchema
  );
  return value.script;
}

async function learn(ctx: RunContext, run: Run): Promise<void> {
  if (!run.review) return;

  const project = await loadProject(ctx.projectId);
  if (!project) return;

  const { lessons } = await distillLessons({
    agent: ctx.agent,
    brief: project.brief,
    review: run.review,
    attempt: ctx.attempt,
    existingLessons: project.lessons.map((l) => l.body),
  });

  run.lessonIds = lessons.map((l) => l.id);
  await updateProject(ctx.projectId, (current) => ({
    ...current,
    lessons: [...current.lessons, ...lessons.filter((l) => !current.lessons.some((e) => e.id === l.id))],
  }));

  ctx.emit({
    type: "stage",
    stage: "LEARNING",
    detail:
      lessons.length === 0
        ? "Nothing new worth adding to the canon."
        : `${lessons.length} lesson(s) proposed. They steer nothing until you accept them.`,
  });
}

// ---------------------------------------------------------------- plumbing

function assertBudget(ctx: RunContext): void {
  if (ctx.agent.totalCostUSD() - ctx.baselineUSD >= ctx.budgetUSD) {
    throw new BudgetExceeded(
      `This attempt reached its $${ctx.budgetUSD.toFixed(2)} ceiling. Raise STELE_RUN_BUDGET_USD to continue.`
    );
  }
}

function replaceRun(run: Run) {
  return (project: Project): Project => ({
    ...project,
    runs: project.runs.some((r) => r.attempt === run.attempt)
      ? project.runs.map((r) => (r.attempt === run.attempt ? { ...run } : r))
      : [...project.runs, { ...run }],
  });
}

/** Only the calls this run made, not everything the process has done since it started. */
function callsFor(ctx: RunContext) {
  return ctx.agent.ledger().slice(ctx.ledgerStart).map(toRecord);
}

async function persist(
  ctx: RunContext,
  run: Run,
  mutate: (project: Project) => Project
): Promise<void> {
  run.calls = callsFor(ctx);
  await updateProject(ctx.projectId, mutate);
}

/** Mirrors the current project state into the knowledge graph. Never fatal to a run. */
async function writeGraph(projectId: string, store: KnowledgeStore): Promise<void> {
  const project = await loadProject(projectId);
  if (!project) return;
  try {
    await store.write(project);
  } catch (error) {
    console.warn(`[pipeline] knowledge write failed: ${short(error)}`);
  }
}

function toRecord(call: LivepeerCall) {
  return {
    ...call,
    error: call.error ? safeText(call.error, 300) : undefined,
  };
}

/**
 * Phrase a shot as an edit of the anchor frame rather than a scene description.
 *
 * `kontext-edit` follows instructions about what to change; handed a full scene description it
 * tends to rebuild the scene and the anchor stops meaning anything. Naming what must not change is
 * the half that does the work.
 */
function editInstruction(plan: ShotPlan, correction: string): string {
  return [
    `Keep the same subject, materials, surface, colour palette and lighting setup exactly as in this image.`,
    `Change only the framing and camera angle: ${plan.keyframeBrief}`,
    correction,
  ]
    .filter(Boolean)
    .join(" ");
}

function countSentences(text: string): number {
  return text.split(/[.!?]+\s/).filter((s) => s.trim().length > 20).length;
}

function short(error: unknown): string {
  return safeText(error instanceof Error ? error.message : String(error), 160);
}

