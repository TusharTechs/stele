import { LivepeerAgent } from "@/livepeer/mcp-client";
import { CAPABILITY, extractJson, think, watchVideo } from "@/livepeer/capabilities";
import { RawReviewSchema, type Brief, type CriterionVerdict, type Finding, type Review } from "./schemas";
import { safeText } from "@/dkg/redact";

/**
 * The review gate.
 *
 * Two things make this more than a score. First, the reviewer **watches the clip** — the network
 * carries a video-understanding capability, so the judgement is made against the footage rather
 * than against a description of what the footage was supposed to be. Second, it is a **gate**: a
 * shot that fails goes back to be rendered again, bounded, rather than being annotated and shipped.
 * A quality report that nothing acts on is decoration.
 *
 * Judgements are made per criterion, and each finding is attached to the criterion it concerns. That
 * attachment is what lets the distiller propose a lesson that addresses a specific failure, and what
 * lets the graph answer "what keeps going wrong with the logo, across every attempt".
 */

export interface ReviewOptions {
  agent: LivepeerAgent;
  brief: Brief;
  videoUrl: string;
  stage: string;
  /** Extra direction for a single shot, e.g. what this shot in particular was meant to establish. */
  shotIntent?: string;
}

export async function reviewVideo(options: ReviewOptions): Promise<Review> {
  const { agent, brief, videoUrl, stage, shotIntent } = options;

  const rubric = buildRubric(brief, shotIntent);
  const watched = await watchVideo(agent, stage, videoUrl, rubric);

  // The video model is asked for JSON and usually obliges, but it is an observation model rather
  // than a formatter. When its reply is prose, a second, cheap text call restructures what it said
  // instead of discarding a perfectly good observation and paying to watch the clip again.
  let raw = extractJson(watched.text);
  let cost = watched.costUSD;

  let parsed = RawReviewSchema.safeParse(raw);
  if (!parsed.success) {
    const repaired = await think(
      agent,
      `${stage}:structure`,
      [
        "A reviewer watched a video clip and wrote the notes below. Convert them, faithfully, into the required JSON.",
        "Do not invent observations the notes do not support. Do not change the reviewer's opinion.",
        "",
        `The clip was judged against these criteria, by index:`,
        ...brief.criteria.map((c) => `  ${c.index}. ${c.body}`),
        "",
        "Required shape:",
        '{"score": <0-10>, "summary": "<one sentence>", "criteria": [{"index": <int>, "met": <bool>, "note": "<short>"}], "strengths": ["<short>"], "problems": ["<short>"]}',
        "",
        "Reviewer notes:",
        watched.text.slice(0, 4000),
      ].join("\n"),
      RawReviewSchema
    );
    raw = repaired.value;
    cost += repaired.costUSD;
    parsed = RawReviewSchema.safeParse(raw);
  }

  if (!parsed.success) {
    throw new Error(`${stage}: the reviewer's response could not be read as a verdict.`);
  }

  const value = parsed.data;
  const findings: Finding[] = [
    ...value.strengths.map((body) => ({ body, polarity: "positive" as const })),
    ...value.problems.map((body) => ({ body, polarity: "negative" as const })),
  ]
    .filter((f) => f.body.trim().length > 0)
    .map((f, index) => ({
      index,
      body: safeText(f.body),
      polarity: f.polarity,
      // Attach a finding to a criterion the reviewer marked unmet, so a lesson can target it.
      criterionIndex:
        f.polarity === "negative"
          ? matchCriterion(f.body, brief, value.criteria.filter((c) => !c.met).map((c) => c.index))
          : undefined,
    }));

  const verdicts = collapseVerdicts(value.criteria, brief);

  return {
    score: clamp(value.score, 0, 10),
    passed: value.score >= brief.targetScore,
    summary: safeText(value.summary, 240),
    findings,
    verdicts,
    costUSD: cost,
    capability: CAPABILITY.review,
  };
}

/**
 * One verdict per criterion, however many the reviewer returned.
 *
 * Observed on a real run: three criteria came back with six verdicts, the model having also scored
 * the brief's "avoid" rules and reused indices 0–2 for them. Left alone, that doubles every
 * criterion in the Run Ledger and hands the distiller the same criterion twice.
 *
 * Where duplicates disagree, unmet wins. A criterion is only satisfied if nothing the reviewer said
 * contradicts it, and quietly promoting a flagged criterion to "met" is the failure mode that
 * matters — it would let a production claim it passed a test a reviewer had just failed it on.
 */
export function collapseVerdicts(
  raw: Array<{ index: number; met: boolean; note: string }>,
  brief: Brief
): CriterionVerdict[] {
  const byIndex = new Map<number, CriterionVerdict>();

  for (const candidate of raw) {
    if (!brief.criteria.some((c) => c.index === candidate.index)) continue;
    const existing = byIndex.get(candidate.index);
    const note = safeText(candidate.note, 200);

    if (!existing) {
      byIndex.set(candidate.index, { index: candidate.index, met: candidate.met, note });
      continue;
    }
    // Keep the note that explains the failure, since that is the one worth learning from.
    if (existing.met && !candidate.met) byIndex.set(candidate.index, { index: candidate.index, met: false, note });
  }

  return [...byIndex.values()].sort((a, b) => a.index - b.index);
}

function buildRubric(brief: Brief, shotIntent?: string): string {
  return [
    "You are a demanding post-production reviewer. Watch this clip and judge it.",
    shotIntent ? `This shot was meant to: ${shotIntent}` : `The film was meant to: ${brief.goal}`,
    brief.audience ? `Intended audience: ${brief.audience}` : "",
    "",
    "Judge it against each of these criteria, by index:",
    ...brief.criteria.map((c) => `  ${c.index}. ${c.body}`),
    // Stated as context, and explicitly not as scoreable criteria — a reviewer told to judge both
    // lists tends to reuse the criterion indices for the avoid rules.
    brief.avoid.length
      ? `\nThese were to be avoided. Do NOT score them as criteria; mention them under problems if you see one: ${brief.avoid.join("; ")}`
      : "",
    "",
    "Be specific and visual. Describe what you actually see, not what you assume was intended.",
    "A problem must be something a person could act on: name the element and what is wrong with it.",
    `A score of ${brief.targetScore} or above means it is ready to ship as-is.`,
    "",
    `Return exactly ${brief.criteria.length} entries in "criteria" — one per index above, no duplicates and nothing extra.`,
    "",
    "Return ONLY this JSON, no prose:",
    '{"score": <0-10 number>, "summary": "<one sentence>", "criteria": [{"index": <int>, "met": <true|false>, "note": "<short>"}], "strengths": ["<short>"], "problems": ["<short>"]}',
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Attach a negative finding to the criterion it is about.
 *
 * Word overlap against the criterion text, restricted to criteria the reviewer already marked unmet
 * — which keeps a vaguely-worded problem from being filed against a criterion that passed. A finding
 * that matches nothing stays unattached rather than being forced onto the nearest candidate; an
 * unattached finding is still useful, a mis-attached one corrupts the criterion's history.
 */
function matchCriterion(finding: string, brief: Brief, unmet: number[]): number | undefined {
  if (unmet.length === 0) return undefined;
  if (unmet.length === 1) return unmet[0];

  const words = new Set(tokens(finding));
  let best: { index: number; score: number } | undefined;

  for (const index of unmet) {
    const criterion = brief.criteria.find((c) => c.index === index);
    if (!criterion) continue;
    const overlap = tokens(criterion.body).filter((word) => words.has(word)).length;
    if (overlap > 0 && (!best || overlap > best.score)) best = { index, score: overlap };
  }
  return best?.index;
}

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "is", "are", "be", "it", "its",
  "this", "that", "with", "for", "as", "at", "by", "from", "should", "must", "shot", "clip", "video",
]);

function tokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3 && !STOP_WORDS.has(word));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
