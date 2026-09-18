import crypto from "node:crypto";

/**
 * The `stele:` vocabulary.
 *
 * The shape of this graph is the whole argument of the project, so it is worth being explicit about
 * why it looks the way it does. Two things are modelled that a key-value memory cannot express:
 *
 *   1. A **Lesson** is attached to the Run that produced it and the Criterion it addresses. That is
 *      what makes "this constraint came from attempt 2 failing the 'legible logo' test" a query
 *      rather than a story.
 *   2. A **PromptClause** is a first-class node linking the text actually sent to a provider back to
 *      the Constraint or Lesson it was compiled from. Without it, "memory improved the result" is an
 *      assertion; with it, it is a join.
 *
 * Everything written here is reviewable: references, hashes, scores and short findings. Prompts are
 * stored as hashes, never verbatim, and `redact.ts` is the gate every literal passes through.
 */

export const NS = "https://stele.studio/ns#";
export const BASE = "https://stele.studio/g/";

export const PREFIXES = `@prefix st: <${NS}> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix schema: <https://schema.org/> .
`;

/** Prefix block for SPARQL, which uses `PREFIX` rather than Turtle's `@prefix`. */
export const SPARQL_PREFIXES = `PREFIX st: <${NS}>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
`;

export type LessonKind = "successfulPattern" | "knownFailure" | "constraint" | "styleAnchor";
export type LessonStatus = "proposed" | "accepted" | "rejected" | "pinned";
export type ConstraintKind = "style" | "subject" | "avoid" | "format";
export type AgentKind = "human" | "machine";

// ---------------------------------------------------------------- IRI construction

/**
 * IRIs are derived, not random.
 *
 * The same logical thing must land on the same IRI across writes, or each snapshot would describe a
 * disconnected graph and nothing would join across attempts. Everything below is a pure function of
 * stable identifiers.
 */
export const iri = {
  project: (projectId: string) => node(`project/${projectId}`),
  canon: (projectId: string) => node(`canon/${projectId}`),
  constraint: (projectId: string, key: string) => node(`constraint/${projectId}/${fingerprint(key)}`),
  criterion: (projectId: string, index: number) => node(`criterion/${projectId}/${index}`),
  run: (projectId: string, attempt: number) => node(`run/${projectId}/${attempt}`),
  artifact: (projectId: string, attempt: number, slot: string) =>
    node(`artifact/${projectId}/${attempt}/${slug(slot)}`),
  review: (projectId: string, attempt: number) => node(`review/${projectId}/${attempt}`),
  finding: (projectId: string, attempt: number, index: number) =>
    node(`finding/${projectId}/${attempt}/${index}`),
  lesson: (projectId: string, attempt: number, index: number) =>
    node(`lesson/${projectId}/${attempt}/${index}`),
  clause: (projectId: string, attempt: number, index: number) =>
    node(`clause/${projectId}/${attempt}/${index}`),
  agent: (label: string) => node(`agent/${slug(label)}`),
  source: (url: string) => node(`source/${fingerprint(url)}`),
};

function node(path: string): string {
  return `<${BASE}${path
    .split("/")
    .map((part) => slug(part))
    .join("/")}>`;
}

export function slug(value: string | number): string {
  return (
    String(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "item"
  );
}

export function fingerprint(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 20);
}

export function contentHash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

// ---------------------------------------------------------------- Turtle literals

/**
 * Turtle is whitespace- and quote-sensitive, and every literal we write is model-authored text that
 * may contain either. Escaping through `JSON.stringify` covers quotes, backslashes and control
 * characters in one pass and matches Turtle's own string syntax closely enough to be safe.
 */
export function lit(value: string): string {
  return JSON.stringify(String(value));
}

export function intLit(value: number): string {
  return `"${Math.trunc(value)}"^^xsd:integer`;
}

export function decLit(value: number): string {
  // Turtle rejects exponent notation for xsd:decimal, which `String(1e-7)` produces.
  return `"${value.toFixed(6)}"^^xsd:decimal`;
}

export function boolLit(value: boolean): string {
  return value ? "true" : "false";
}

export function dateLit(value: number | string): string {
  const iso = typeof value === "number" ? new Date(value).toISOString() : value;
  return `"${iso}"^^xsd:dateTime`;
}

/**
 * Wrap a bare IRI for Turtle, leaving an already-wrapped one alone.
 *
 * IRIs reach us from two directions: built by `iri.*` (already in angle brackets) and read back out
 * of a SPARQL result (bare, because a binding carries the term's value). Emitting a bare one makes
 * the parser read `https:` as an undeclared prefix and reject the whole assertion — so normalise at
 * the point of writing rather than trusting every call site to know which kind it holds.
 */
export function iriLit(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (trimmed.startsWith("<") && trimmed.endsWith(">")) return trimmed;
  if (!/^https?:\/\//.test(trimmed)) return undefined;
  return `<${trimmed}>`;
}

/** Emits `subject predicate object .` lines, skipping any object that resolved to nothing. */
export function triples(subject: string, pairs: Array<[string, string | undefined]>): string {
  return pairs
    .filter((pair): pair is [string, string] => pair[1] !== undefined && pair[1] !== "")
    .map(([predicate, object]) => `${subject} ${predicate} ${object} .`)
    .join("\n");
}
