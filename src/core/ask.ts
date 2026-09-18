import { z } from "zod";
import { livepeer } from "@/livepeer/mcp-client";
import { think } from "@/livepeer/capabilities";
import { knowledgeStore } from "@/dkg/client";
import { NS, SPARQL_PREFIXES, iri } from "@/dkg/ontology";
import type { Binding } from "@/dkg/queries";

/**
 * A question in English, answered by the graph.
 *
 * The model writes SPARQL; the store answers it; you see both. That order matters. A system that
 * hides the query and paraphrases the rows is asking to be trusted about two separate things — that
 * it understood the question, and that it read the answer correctly — with no way to check either.
 * Showing the query makes the first auditable, and showing the rows makes the second unnecessary.
 *
 * The model never touches the data. It only writes a read-only query, which is validated before it
 * runs, so a wrong question produces an empty result set rather than a confident invention.
 */

const AskSchema = z.object({
  sparql: z.string().min(20).max(4000),
  /** What the model thinks it asked for, in one line, so a mismatch with the question is visible. */
  reading: z.string().min(4).max(200),
});

export interface AskResult {
  question: string;
  sparql: string;
  reading: string;
  bindings: Binding[];
  servedBy: string;
  ms: number;
  costUSD: number;
  truncated: boolean;
}

/** Everything the model is allowed to know about the shape of the graph. */
function schemaBrief(projectId: string): string {
  return `The graph uses the vocabulary <${NS}>, bound to the prefix st:.

Classes and the predicates they carry:

  st:Project      st:title, st:aspectRatio, st:attemptCount, st:targetScore, st:criterionCount
  st:Canon        st:forProject, st:canonVersion, st:lessonCount, st:activeLessonCount, st:latestScore
  st:Constraint   st:forProject, st:constraintKind ("style"|"subject"|"avoid"|"format"), st:body, st:weight
  st:Lesson       st:forProject, st:lessonKind ("successfulPattern"|"knownFailure"|"constraint"|"styleAnchor"),
                  st:body, st:status ("proposed"|"accepted"|"rejected"|"pinned"), st:confidence,
                  st:fromAttempt, st:addressesCriterion, st:originProject, st:originProjectTitle, st:curatedBy
  st:Criterion    st:forProject, st:criterionIndex, st:body
  st:Run          st:forProject, st:attempt, st:canonVersion, st:usedMemory, st:memoryWithheld,
                  st:memoryClauseCount, st:promptHash, st:costUSD, st:callCount, st:stage,
                  st:hasReview, st:usedClause, st:producedArtifact, st:cutReference
  st:PromptClause st:clauseOrder, st:body, st:clauseRole, st:sourceKind ("brief"|"constraint"|"lesson"),
                  st:derivedFrom, st:fromAttempt, st:addressesCriterion
  st:Review       st:forRun, st:score, st:passed, st:summary, st:hasFinding,
                  st:criterionMet, st:criterionMissed
  st:Finding      st:fromAttempt, st:body, st:polarity ("positive"|"negative"|"neutral"), st:aboutCriterion
  st:Artifact     st:artifactIndex, st:mediaType, st:capability, st:reference, st:shotScore, st:costUSD

The project being asked about is ${iri.project(projectId)}.
Most nodes carry st:forProject, so scope with that unless the question is explicitly across projects.`;
}

/** Only reads. An update reaching the store would let a typed question rewrite the provenance record. */
const MUTATING = /\b(INSERT|DELETE|DROP|CLEAR|LOAD|CREATE|COPY|MOVE|ADD|WITH|USING)\b/i;

export class UnsafeQuery extends Error {}

export async function askGraph(projectId: string, question: string): Promise<AskResult> {
  const agent = livepeer();

  const prompt = [
    "Write one SPARQL query that answers the question below against this knowledge graph.",
    "",
    schemaBrief(projectId),
    "",
    `Question: ${question}`,
    "",
    "Rules:",
    "  - SELECT only. Never INSERT, DELETE, DROP, CLEAR, LOAD or CREATE.",
    // Both stores must answer it, and one of them silently returns nothing for a UNION.
    "  - Do NOT use UNION. Use VALUES or OPTIONAL instead; the store answers UNION with zero rows.",
    "  - Include the PREFIX lines. Add LIMIT 100 unless the question implies a single answer.",
    "  - Return readable values: prefer st:body and st:title over bare IRIs where both exist.",
    "  - If the question cannot be answered from these predicates, write a query that returns no rows",
    "    rather than inventing a predicate that does not exist.",
    "",
    'Return: {"sparql": "...", "reading": "<one line: what you understood the question to ask for>"}',
  ].join("\n");

  const { value, costUSD } = await think(agent, "ask", prompt, AskSchema);

  const sparql = value.sparql.trim();
  if (MUTATING.test(sparql)) {
    throw new UnsafeQuery("The generated query was not read-only, so it was not run.");
  }

  // A model that forgets the prefixes produces a query that fails on a technicality rather than on
  // its substance. Prepending them is cheaper than a second round trip.
  const withPrefixes = /\bPREFIX\s+st:/i.test(sparql) ? sparql : `${SPARQL_PREFIXES}${sparql}`;

  const result = await knowledgeStore().query(withPrefixes);

  return {
    question,
    sparql: withPrefixes,
    reading: value.reading,
    bindings: result.bindings.slice(0, 200),
    servedBy: result.servedBy,
    ms: result.ms,
    costUSD,
    truncated: result.bindings.length > 200,
  };
}

/** Questions worth asking, offered so the box is never empty for someone who does not know the schema. */
export const SUGGESTED_QUESTIONS = [
  "Which rules have steered the most renders?",
  "What has this production failed on more than once?",
  "Which lessons came from another production?",
  "What did attempt 1 get wrong that attempt 2 fixed?",
  "Which capability has cost the most across every attempt?",
  "Show every rule a human rejected, and which attempt proposed it.",
];
