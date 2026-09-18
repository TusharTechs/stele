import crypto from "node:crypto";
import { z } from "zod";
import { LivepeerAgent } from "@/livepeer/mcp-client";
import { think } from "@/livepeer/capabilities";
import { safeText } from "@/dkg/redact";
import type { Brief, Lesson, Review } from "./schemas";

/**
 * Turns a review into knowledge worth keeping.
 *
 * A finding describes *this* attempt ("the logo is cropped at the right edge"). A lesson has to be
 * usable by the *next* one ("keep the logo fully inside the frame with clear margin on all sides").
 * That conversion is the whole job, and it is why the loop is not simply "paste the critique into the
 * next prompt" — a critique aimed backwards does not steer a render forwards.
 *
 * Everything proposed here lands in the graph as `proposed` and steers nothing until a human accepts
 * it. That is deliberate: the model's confidence in a wrong observation is indistinguishable from its
 * confidence in a right one, and an unreviewed mistake that enters the canon corrupts every later
 * attempt while looking exactly like progress.
 */

const ProposedLessonSchema = z.object({
  kind: z.enum(["successfulPattern", "knownFailure", "constraint", "styleAnchor"]),
  body: z.string().min(8).max(240),
  criterionIndex: z.number().int().min(0).optional(),
  confidence: z.number().min(0).max(1),
});

const DistillationSchema = z.object({
  lessons: z.array(ProposedLessonSchema).min(0).max(6),
});

export interface DistillOptions {
  agent: LivepeerAgent;
  brief: Brief;
  review: Review;
  attempt: number;
  /** What the previous canon already says, so the distiller does not re-propose it. */
  existingLessons: string[];
}

export async function distillLessons(
  options: DistillOptions
): Promise<{ lessons: Lesson[]; costUSD: number }> {
  const { agent, brief, review, attempt, existingLessons } = options;

  const unmet = review.verdicts.filter((v) => !v.met);
  const problems = review.findings.filter((f) => f.polarity === "negative");
  const strengths = review.findings.filter((f) => f.polarity === "positive");

  // Nothing went wrong and nothing notable went right: there is no lesson here, and inventing one
  // would dilute the canon with filler that still costs prompt budget on every later render.
  if (problems.length === 0 && strengths.length === 0 && unmet.length === 0) {
    return { lessons: [], costUSD: 0 };
  }

  const prompt = [
    "You maintain the production canon for a film project: a short list of rules that steer how the next version is generated.",
    "",
    `The brief: ${brief.goal}`,
    brief.styleNote ? `House style: ${brief.styleNote}` : "",
    "",
    "Success criteria, by index:",
    ...brief.criteria.map((c) => `  ${c.index}. ${c.body}`),
    "",
    `A reviewer watched attempt ${attempt} and scored it ${review.score}/10 (target ${brief.targetScore}).`,
    review.summary ? `Their summary: ${review.summary}` : "",
    unmet.length
      ? `\nCriteria they judged unmet:\n${unmet.map((v) => `  ${v.index}. ${v.note || "unmet"}`).join("\n")}`
      : "\nThey judged every criterion met.",
    problems.length ? `\nProblems they named:\n${problems.map((f) => `  - ${f.body}`).join("\n")}` : "",
    strengths.length ? `\nWhat worked:\n${strengths.map((f) => `  - ${f.body}`).join("\n")}` : "",
    existingLessons.length
      ? `\nThe canon already says the following. Do NOT repeat or rephrase any of it:\n${existingLessons.map((l) => `  - ${l}`).join("\n")}`
      : "",
    "",
    "Write the rules that should steer the NEXT attempt. Rules, not observations:",
    "  - Write each as an instruction a generator can follow, in the imperative.",
    "  - 'The logo was cut off' is an observation. 'Keep the full logo inside frame with clear margin' is a rule.",
    "  - Make each one specific enough to change an image. Discard anything that would be true of any film.",
    "  - Set criterionIndex when the rule exists to fix a specific unmet criterion.",
    "  - kind: knownFailure for something to avoid, successfulPattern for something that worked and should be kept,",
    "    styleAnchor for a look worth locking in, constraint for a hard requirement.",
    "  - confidence: how strongly the evidence supports this rule, 0 to 1. One reviewer comment is weak evidence.",
    "  - Propose at most 4. Fewer, sharper rules beat a long list. Propose none if there is nothing worth keeping.",
    "",
    'Return: {"lessons": [{"kind": "...", "body": "...", "criterionIndex": <int, optional>, "confidence": <0-1>}]}',
  ]
    .filter(Boolean)
    .join("\n");

  const { value, costUSD } = await think(agent, `distill:attempt-${attempt}`, prompt, DistillationSchema);

  const known = new Set(existingLessons.map(normalise));
  const lessons: Lesson[] = [];

  for (const proposed of value.lessons) {
    const body = safeText(proposed.body, 240);
    const key = normalise(body);
    // The instruction not to repeat the canon is a request, not a guarantee; enforce it here too.
    if (!body || known.has(key)) continue;
    known.add(key);

    lessons.push({
      id: lessonId(attempt, body),
      kind: proposed.kind,
      body,
      status: "proposed",
      confidence: proposed.confidence,
      learnedFromAttempt: attempt,
      criterionIndex:
        proposed.criterionIndex !== undefined &&
        brief.criteria.some((c) => c.index === proposed.criterionIndex)
          ? proposed.criterionIndex
          : undefined,
    });
  }

  return { lessons, costUSD };
}

/**
 * Derived from the attempt and the text, so re-running a stage cannot duplicate a lesson.
 *
 * Runs are resumable, which means the distillation stage can execute twice for the same attempt
 * after an interruption. A random id would produce two graph nodes saying the same thing.
 */
function lessonId(attempt: number, body: string): string {
  return `l${attempt}-${crypto.createHash("sha256").update(`${attempt}:${normalise(body)}`).digest("hex").slice(0, 10)}`;
}

function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}
