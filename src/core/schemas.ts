import { z } from "zod";

/**
 * Every shape that crosses a stage boundary, validated.
 *
 * Two of these are load-bearing and worth reading first. `CompiledPromptSchema` is what lets the
 * product claim causality instead of correlation: a clause carries the identity of the knowledge it
 * came from, so the prompt that went to a provider can be joined back to the graph. `RunSchema`
 * carries `memoryWithheld`, which is the control condition — a run that deliberately ignores
 * everything the project has learned, so an improvement can be measured against something.
 */

export const CriterionSchema = z.object({
  index: z.number().int().min(0),
  body: z.string().min(1),
});
export type Criterion = z.infer<typeof CriterionSchema>;

export const BriefSchema = z.object({
  goal: z.string().min(1),
  audience: z.string().default(""),
  styleNote: z.string().default(""),
  criteria: z.array(CriterionSchema).min(1),
  avoid: z.array(z.string()).default([]),
  shotCount: z.number().int().min(1).max(8).default(3),
  shotSeconds: z.number().int().min(6).max(20).default(6),
  aspectRatio: z.string().default("16:9"),
  targetScore: z.number().min(1).max(10).default(8),
  /** A page whose claims the script should stay faithful to, retrieved at run time. */
  groundingUrl: z.string().optional(),
  narration: z.boolean().default(true),
  music: z.boolean().default(true),
});
export type Brief = z.infer<typeof BriefSchema>;

export const ConstraintSchema = z.object({
  id: z.string(),
  kind: z.enum(["style", "subject", "avoid", "format"]),
  body: z.string(),
  weight: z.number().min(0).max(1).default(0.5),
  authoredBy: z.string().default("human"),
  createdAt: z.number(),
});
export type Constraint = z.infer<typeof ConstraintSchema>;

export const LessonSchema = z.object({
  id: z.string(),
  kind: z.enum(["successfulPattern", "knownFailure", "constraint", "styleAnchor"]),
  body: z.string(),
  /**
   * Nothing steers a render until a human accepts it.
   *
   * The reference implementation for this track feeds everything it learns straight back into the
   * next prompt. That makes the loop autonomous but ungoverned: one confidently wrong observation
   * poisons every later attempt, and there is no way to tell the model it was wrong. Proposed
   * lessons sit in the graph and are visible, but only `accepted` and `pinned` ones compile.
   */
  status: z.enum(["proposed", "accepted", "rejected", "pinned"]).default("proposed"),
  confidence: z.number().min(0).max(1).default(0.5),
  learnedFromAttempt: z.number().int().min(0),
  criterionIndex: z.number().int().min(0).optional(),
  /** Set when the lesson arrived from another project's shared memory rather than this one's. */
  originProjectId: z.string().optional(),
  originProjectTitle: z.string().optional(),
  originAgent: z.string().optional(),
  curatedBy: z.string().optional(),
  curatedAt: z.number().optional(),
});
export type Lesson = z.infer<typeof LessonSchema>;

export const ClauseSchema = z.object({
  index: z.number().int().min(0),
  body: z.string(),
  role: z.enum(["goal", "style", "subject", "avoid", "lesson", "criterion", "format"]),
  /** The constraint or lesson this clause was compiled from. Absent only for the goal itself. */
  sourceId: z.string().optional(),
  sourceKind: z.enum(["brief", "constraint", "lesson"]),
  sourceAttempt: z.number().int().min(0).optional(),
  criterionIndex: z.number().int().min(0).optional(),
  /** The graph IRI the clause came from, so the UI can link straight into the SPARQL result. */
  sourceIri: z.string().optional(),
  originProjectId: z.string().optional(),
  /** The production that proved this rule, by name. An id nobody can resolve is not attribution. */
  originProjectTitle: z.string().optional(),
});
export type Clause = z.infer<typeof ClauseSchema>;

export const CompiledPromptSchema = z.object({
  text: z.string(),
  clauses: z.array(ClauseSchema),
  /** How many clauses came from learned knowledge rather than the brief. */
  memoryClauseCount: z.number().int().min(0),
  promptHash: z.string(),
});
export type CompiledPrompt = z.infer<typeof CompiledPromptSchema>;

export const FindingSchema = z.object({
  index: z.number().int().min(0),
  body: z.string(),
  polarity: z.enum(["positive", "negative", "neutral"]),
  criterionIndex: z.number().int().min(0).optional(),
});
export type Finding = z.infer<typeof FindingSchema>;

export const CriterionVerdictSchema = z.object({
  index: z.number().int().min(0),
  met: z.boolean(),
  note: z.string().default(""),
});
export type CriterionVerdict = z.infer<typeof CriterionVerdictSchema>;

export const ReviewSchema = z.object({
  score: z.number().min(0).max(10),
  passed: z.boolean(),
  summary: z.string().default(""),
  findings: z.array(FindingSchema).default([]),
  verdicts: z.array(CriterionVerdictSchema).default([]),
  costUSD: z.number().default(0),
  capability: z.string().default(""),
});
export type Review = z.infer<typeof ReviewSchema>;

/** What the reviewer capability is asked to return, before it is enriched into a `Review`. */
export const RawReviewSchema = z.object({
  score: z.number().min(0).max(10),
  summary: z.string().default(""),
  criteria: z
    .array(
      z.object({
        index: z.number().int().min(0),
        met: z.boolean(),
        note: z.string().default(""),
      })
    )
    .default([]),
  strengths: z.array(z.string()).default([]),
  problems: z.array(z.string()).default([]),
});

export const ShotPlanSchema = z.object({
  index: z.number().int().min(0),
  intent: z.string(),
  keyframeBrief: z.string(),
  motion: z.string(),
  seconds: z.number().int().min(6).max(20),
});
export type ShotPlan = z.infer<typeof ShotPlanSchema>;

export const ShotRecordSchema = z.object({
  index: z.number().int().min(0),
  intent: z.string(),
  prompt: CompiledPromptSchema,
  motionPrompt: z.string().default(""),
  keyframeUrl: z.string().optional(),
  /** Which capability produced the keyframe — generated fresh, or edited from the anchor. */
  keyframeCapability: z.string().optional(),
  /** The anchor frame this shot was derived from. Absent on the shot that establishes it. */
  anchoredTo: z.string().optional(),
  videoUrl: z.string().optional(),
  capability: z.string().default(""),
  costUSD: z.number().default(0),
  review: ReviewSchema.optional(),
  attempts: z.number().int().min(0).default(0),
  status: z.enum(["pending", "rendering", "reviewing", "passed", "failed", "accepted"]).default("pending"),
  error: z.string().optional(),
});
export type ShotRecord = z.infer<typeof ShotRecordSchema>;

export const GroundedSourceSchema = z.object({
  url: z.string(),
  retrievedAt: z.number(),
  excerptHash: z.string(),
  claimCount: z.number().int().min(0).default(0),
  ok: z.boolean().default(true),
});
export type GroundedSource = z.infer<typeof GroundedSourceSchema>;

export const LivepeerCallRecordSchema = z.object({
  id: z.string(),
  capability: z.string(),
  stage: z.string(),
  argsHash: z.string(),
  at: z.number(),
  latencyMs: z.number(),
  ok: z.boolean(),
  costUSD: z.number(),
  costUnitKind: z.string().optional(),
  costUnits: z.number().optional(),
  jobId: z.string().optional(),
  outputUrl: z.string().optional(),
  warnings: z.array(z.object({ kind: z.string(), message: z.string() })).default([]),
  error: z.string().optional(),
});

/** In execution order: the cut is assembled before it is reviewed, because the review watches the cut. */
export const RunStageSchema = z.enum([
  "QUEUED",
  "GROUNDING",
  "COMPILING",
  "PLANNING",
  "RENDERING",
  "ASSEMBLING",
  "REVIEWING",
  "LEARNING",
  "COMPLETE",
  "FAILED",
]);
export type RunStage = z.infer<typeof RunStageSchema>;

export const RunSchema = z.object({
  attempt: z.number().int().min(1),
  startedAt: z.number(),
  finishedAt: z.number().optional(),
  stage: RunStageSchema.default("QUEUED"),
  /**
   * The control condition. A withheld run compiles its prompt from the brief alone, ignoring every
   * lesson the project has learned, so the pair of runs differs in exactly one variable.
   */
  memoryWithheld: z.boolean().default(false),
  canonVersion: z.number().int().min(0).default(0),
  basePrompt: CompiledPromptSchema.optional(),
  shots: z.array(ShotRecordSchema).default([]),
  cutUrl: z.string().optional(),
  narrationUrl: z.string().optional(),
  musicUrl: z.string().optional(),
  review: ReviewSchema.optional(),
  /** Set when the cut finished but the reviewer could not score it. The attempt still stands. */
  reviewError: z.string().optional(),
  /** Set when the shots could not be cut together and the film fell back to a single shot. */
  assemblyNote: z.string().optional(),
  lessonIds: z.array(z.string()).default([]),
  costUSD: z.number().default(0),
  calls: z.array(LivepeerCallRecordSchema).default([]),
  error: z.string().optional(),
  /** Set on a run created as the paired control of another, and vice versa. */
  pairedWithAttempt: z.number().int().optional(),
});
export type Run = z.infer<typeof RunSchema>;

export const SealSchema = z.object({
  ual: z.string().optional(),
  txHash: z.string().optional(),
  network: z.string(),
  contextGraph: z.string(),
  assetNames: z.array(z.string()),
  sealedAt: z.number(),
  attempt: z.number().int(),
  mode: z.enum(["network", "edge", "file"]),
});
export type Seal = z.infer<typeof SealSchema>;

export const ProjectSchema = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  agentLabel: z.string().default("studio-a"),
  /** One line on what this production demonstrates. Set on the shipped demo bundle. */
  note: z.string().optional(),
  brief: BriefSchema,
  canonVersion: z.number().int().min(0).default(1),
  constraints: z.array(ConstraintSchema).default([]),
  lessons: z.array(LessonSchema).default([]),
  runs: z.array(RunSchema).default([]),
  sources: z.array(GroundedSourceSchema).default([]),
  seals: z.array(SealSchema).default([]),
  /** Lessons pulled in from other projects' shared memory, kept separate until accepted. */
  inheritedLessonIds: z.array(z.string()).default([]),
});
export type Project = z.infer<typeof ProjectSchema>;

export function latestRun(project: Project): Run | undefined {
  return project.runs.at(-1);
}

export function scoredRuns(project: Project): Run[] {
  return project.runs.filter((run) => run.review !== undefined);
}
