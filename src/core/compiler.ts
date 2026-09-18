import crypto from "node:crypto";
import type { KnowledgeStore, DkgMode } from "@/dkg/client";
import { memoryForCompile } from "@/dkg/queries";
import type { Binding } from "@/dkg/queries";
import type { Brief, Clause, CompiledPrompt, Project, ShotPlan } from "./schemas";

/**
 * Turns knowledge into a prompt, and remembers which knowledge became which words.
 *
 * This is the difference between this project and a memory that simply concatenates remembered
 * strings. A compiled prompt is a list of **clauses**, and each clause keeps the identity of the
 * constraint or lesson it came from, the attempt that learned it, and the criterion it addresses.
 * So when a score moves, the question "was it the memory?" is answerable by a join instead of a
 * shrug — which is precisely the doubt the workshop for this track raised about scores alone.
 *
 * The knowledge is read through SPARQL against the knowledge store, not from application state. That
 * is not ceremony: it is what makes a lesson proved by *another* project usable here, and what makes
 * the "Why this prompt" panel a view of the graph rather than a view of a local array.
 */

export interface CompileOptions {
  project: Project;
  store: KnowledgeStore;
  /**
   * The control condition: compile from the brief alone, as though the project had never run.
   *
   * Used by the paired-run experiment. It has to be a compile-time switch rather than a filter
   * applied afterwards, so that the withheld run differs from its partner in exactly one variable.
   */
  withholdMemory?: boolean;
  shot?: ShotPlan;
}

export interface CompileResult {
  prompt: CompiledPrompt;
  /** Which store answered the memory query — rendered in the UI so a fallback is never hidden. */
  servedBy: DkgMode;
  queryMs: number;
  rowCount: number;
}

export async function compilePrompt(options: CompileOptions): Promise<CompileResult> {
  const { project, store, withholdMemory = false, shot } = options;

  let rows: Binding[] = [];
  let servedBy: DkgMode = store.mode;
  let queryMs = 0;

  if (!withholdMemory) {
    const result = await store.query(memoryForCompile(project.id));
    rows = result.bindings;
    servedBy = result.servedBy;
    queryMs = result.ms;
  }

  const clauses = assembleClauses(project.brief, rows, shot);
  const text = clauses.map((clause) => clause.body).join(" ");

  return {
    prompt: {
      text,
      clauses,
      memoryClauseCount: clauses.filter((c) => c.sourceKind === "lesson").length,
      promptHash: crypto.createHash("sha256").update(text).digest("hex"),
    },
    servedBy,
    queryMs,
    rowCount: rows.length,
  };
}

/**
 * Order matters, so it is decided here rather than left to whatever order rows arrive in.
 *
 * Subject first, then style, then what was learned, then prohibitions, then format. Image and video
 * models weight early tokens more heavily, so the subject has to lead; prohibitions read better last,
 * where they qualify everything above rather than interrupting it.
 */
function assembleClauses(brief: Brief, rows: Binding[], shot?: ShotPlan): Clause[] {
  const clauses: Array<Omit<Clause, "index">> = [];

  // 1. What this shot is. The shot's own brief supersedes the film's goal when compiling for a shot.
  clauses.push({
    body: shot ? shot.keyframeBrief : brief.goal,
    role: "goal",
    sourceKind: "brief",
  });

  if (shot?.motion) {
    clauses.push({ body: shot.motion, role: "format", sourceKind: "brief" });
  }

  if (brief.styleNote.trim()) {
    clauses.push({ body: brief.styleNote.trim(), role: "style", sourceKind: "brief" });
  }

  // 2. Knowledge from the graph: constraints the human set, then lessons the loop proved.
  const constraints = rows.filter((row) => row.sourceKind === "constraint");
  const lessons = rows.filter((row) => row.sourceKind === "lesson");

  for (const row of constraints) {
    const body = row.body?.trim();
    if (!body) continue;
    const kind = row.kind ?? "style";
    clauses.push({
      body: kind === "avoid" ? `Avoid: ${body}` : body,
      role: kind === "avoid" ? "avoid" : kind === "subject" ? "subject" : "style",
      sourceKind: "constraint",
      sourceId: row.node,
      sourceIri: row.node,
    });
  }

  for (const row of lessons) {
    const body = row.body?.trim();
    if (!body) continue;
    clauses.push({
      body: row.kind === "knownFailure" ? `Avoid: ${body}` : body,
      role: row.kind === "knownFailure" ? "avoid" : "lesson",
      sourceKind: "lesson",
      sourceId: row.node,
      sourceIri: row.node,
      sourceAttempt: row.fromAttempt ? Number(row.fromAttempt) : undefined,
      criterionIndex: row.criterion ? criterionIndexFromIri(row.criterion) : undefined,
      originProjectId: row.originProject,
    });
  }

  // 3. Prohibitions straight from the brief, deduplicated against anything the graph already said.
  const seen = new Set(clauses.map((c) => normalise(c.body)));
  for (const avoid of brief.avoid) {
    const body = `Avoid: ${avoid.trim()}`;
    if (!avoid.trim() || seen.has(normalise(body))) continue;
    seen.add(normalise(body));
    clauses.push({ body, role: "avoid", sourceKind: "brief" });
  }

  return dedupe(clauses).map((clause, index) => ({ ...clause, index }));
}

/**
 * Drop clauses that say the same thing twice.
 *
 * Lessons accumulate across attempts and several of them tend to circle the same observation. A
 * prompt that repeats itself wastes the model's attention budget on the repeated clause, and the
 * "Why this prompt" panel becomes noise. The first occurrence wins, which keeps the higher-confidence
 * row (rows arrive ordered by weight).
 */
function dedupe(clauses: Array<Omit<Clause, "index">>): Array<Omit<Clause, "index">> {
  const seen = new Set<string>();
  return clauses.filter((clause) => {
    const key = normalise(clause.body);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

function criterionIndexFromIri(value: string): number | undefined {
  const index = Number(value.split("/").pop());
  return Number.isInteger(index) ? index : undefined;
}

/**
 * Extends a film-level prompt with a shot's own direction.
 *
 * Shot prompts must inherit the film's compiled knowledge — otherwise a lesson about the palette
 * steers shot one and quietly stops applying to shot two — so the base clauses are carried through
 * with their provenance intact and the shot's own clauses are spliced in at the front.
 */
export function extendForShot(base: CompiledPrompt, shot: ShotPlan): CompiledPrompt {
  const shotClauses: Array<Omit<Clause, "index">> = [
    { body: shot.keyframeBrief, role: "goal", sourceKind: "brief" },
  ];

  // Everything from the base except its own film-level goal, which the shot brief replaces.
  const inherited = base.clauses.filter((clause) => clause.role !== "goal");
  const merged = dedupe([...shotClauses, ...inherited]).map((clause, index) => ({ ...clause, index }));
  const text = merged.map((clause) => clause.body).join(" ");

  return {
    text,
    clauses: merged,
    memoryClauseCount: merged.filter((c) => c.sourceKind === "lesson").length,
    promptHash: crypto.createHash("sha256").update(text).digest("hex"),
  };
}

/** A short, human-readable account of what the graph contributed. Used in the run header. */
export function describeMemory(prompt: CompiledPrompt): string {
  const total = prompt.clauses.length;
  const fromMemory = prompt.memoryClauseCount;
  if (fromMemory === 0) return `${total} clauses, none from learned knowledge`;
  const attempts = [...new Set(prompt.clauses.map((c) => c.sourceAttempt).filter((a): a is number => a !== undefined))];
  const origin = attempts.length ? ` learned in attempt ${attempts.sort((a, b) => a - b).join(", ")}` : "";
  return `${total} clauses, ${fromMemory} from learned knowledge${origin}`;
}
