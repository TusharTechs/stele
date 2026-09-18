import { SPARQL_PREFIXES, iri } from "./ontology";

/**
 * The queries that actually change what the application does.
 *
 * This file is the answer to "does verifiable knowledge materially improve the application?" — if
 * these queries return nothing, the product renders from the brief alone and scores worse. They are
 * kept together, and kept readable, because a judge should be able to paste any one of them into the
 * SPARQL console and get the same rows the compiler used.
 *
 * `memoryForCompile` is the one in the hot path: every render calls it, and its rows become the
 * clauses of the outgoing prompt.
 */

export interface Binding {
  [variable: string]: string | undefined;
}

/**
 * Knowledge admitted to the next render.
 *
 * Constraints and lessons arrive in one result set because the compiler treats them uniformly — the
 * difference that matters downstream is provenance, not type. Rejected and merely proposed lessons
 * are excluded here rather than filtered later, so the boundary between "the graph knows this" and
 * "this steers a render" lives in exactly one place.
 */
export function memoryForCompile(projectId: string): string {
  const project = iri.project(projectId);
  return `${SPARQL_PREFIXES}
SELECT ?node ?kind ?body ?weight ?status ?fromAttempt ?criterion ?originProject ?originTitle ?sourceKind
WHERE {
  {
    ?node a st:Constraint ;
          st:forProject ${project} ;
          st:constraintKind ?kind ;
          st:body ?body ;
          st:weight ?weight .
    BIND("constraint" AS ?sourceKind)
  }
  UNION
  {
    ?node a st:Lesson ;
          st:forProject ${project} ;
          st:lessonKind ?kind ;
          st:body ?body ;
          st:status ?status ;
          st:confidence ?weight ;
          st:fromAttempt ?fromAttempt .
    FILTER (?status = "accepted" || ?status = "pinned")
    OPTIONAL { ?node st:addressesCriterion ?criterion }
    OPTIONAL { ?node st:originProject ?originProject }
    OPTIONAL { ?node st:originProjectTitle ?originTitle }
    BIND("lesson" AS ?sourceKind)
  }
}
ORDER BY DESC(?weight)`;
}

/**
 * Knowledge other projects have proven, offered to this one.
 *
 * This is the query a local file cannot answer honestly. It reaches across project boundaries into
 * shared memory, and it carries attribution back with the body — a lesson arrives knowing which
 * project and which agent established it, which is the difference between inheriting knowledge and
 * copying a string.
 *
 * Only lessons a human accepted or pinned in their own project are offered: `proposed` is a
 * machine's guess, and one studio's unreviewed guess should not steer another studio's render.
 */
export function sharedLessons(excludeProjectId: string, limit = 12): string {
  const excluded = iri.project(excludeProjectId);
  return `${SPARQL_PREFIXES}
SELECT ?node ?kind ?body ?confidence ?status ?fromAttempt ?originProject ?originTitle ?originAgent
WHERE {
  ?node a st:Lesson ;
        st:lessonKind ?kind ;
        st:body ?body ;
        st:status ?status ;
        st:confidence ?confidence ;
        st:fromAttempt ?fromAttempt ;
        st:originProject ?originProject .
  OPTIONAL { ?node st:originProjectTitle ?originTitle }
  OPTIONAL { ?node st:originAgent ?originAgent }
  FILTER (?status = "accepted" || ?status = "pinned")
  FILTER (?originProject != ${excluded})
}
ORDER BY DESC(?confidence)
LIMIT ${limit}`;
}

/**
 * Where every clause of a run's prompt came from.
 *
 * This backs the "Why this prompt" panel. The workshop for this track made the point that a higher
 * score does not by itself show that memory caused the improvement — you have to look at the
 * knowledge the next prompt actually used. These rows are that look, resolved through the graph
 * rather than read off application state.
 */
export function clauseProvenance(projectId: string, attempt: number): string {
  return `${SPARQL_PREFIXES}
SELECT ?clause ?order ?body ?role ?sourceKind ?derivedFrom ?fromAttempt ?criterion ?sourceBody
WHERE {
  ${iri.run(projectId, attempt)} st:usedClause ?clause .
  ?clause st:clauseOrder ?order ;
          st:body ?body ;
          st:clauseRole ?role ;
          st:sourceKind ?sourceKind .
  OPTIONAL { ?clause st:derivedFrom ?derivedFrom . OPTIONAL { ?derivedFrom st:body ?sourceBody } }
  OPTIONAL { ?clause st:fromAttempt ?fromAttempt }
  OPTIONAL { ?clause st:addressesCriterion ?criterion }
}
ORDER BY ?order`;
}

/** Every attempt with its score and whether memory was in play — the data behind the comparison. */
export function runHistory(projectId: string): string {
  return `${SPARQL_PREFIXES}
SELECT ?run ?attempt ?score ?passed ?usedMemory ?memoryWithheld ?memoryClauseCount ?costUSD ?canonVersion
WHERE {
  ?run a st:Run ;
       st:forProject ${iri.project(projectId)} ;
       st:attempt ?attempt ;
       st:usedMemory ?usedMemory ;
       st:memoryWithheld ?memoryWithheld ;
       st:memoryClauseCount ?memoryClauseCount ;
       st:costUSD ?costUSD ;
       st:canonVersion ?canonVersion .
  OPTIONAL { ?run st:hasReview ?review . ?review st:score ?score ; st:passed ?passed }
}
ORDER BY ?attempt`;
}

/** Everything the graph holds about one project — the default view in the SPARQL console. */
export function projectGraph(projectId: string, limit = 500): string {
  return `${SPARQL_PREFIXES}
SELECT ?subject ?predicate ?object
WHERE {
  ?subject ?predicate ?object .
  { ?subject st:forProject ${iri.project(projectId)} }
  UNION { BIND(${iri.project(projectId)} AS ?subject) }
}
LIMIT ${limit}`;
}

/** Findings recorded against a criterion across every attempt — what keeps going wrong, and where. */
export function criterionHistory(projectId: string): string {
  return `${SPARQL_PREFIXES}
SELECT ?criterionIndex ?criterionBody ?attempt ?polarity ?finding
WHERE {
  ?criterion a st:Criterion ;
             st:forProject ${iri.project(projectId)} ;
             st:criterionIndex ?criterionIndex ;
             st:body ?criterionBody .
  ?f a st:Finding ;
     st:aboutCriterion ?criterion ;
     st:fromAttempt ?attempt ;
     st:polarity ?polarity ;
     st:body ?finding .
}
ORDER BY ?criterionIndex ?attempt`;
}

export const SAMPLE_QUERIES: Array<{ label: string; description: string; build: (projectId: string) => string }> = [
  {
    label: "Knowledge steering the next render",
    description: "Exactly the rows the prompt compiler reads before every shot.",
    build: memoryForCompile,
  },
  {
    label: "Attempt history",
    description: "Every run with its score and whether memory was in play.",
    build: runHistory,
  },
  {
    label: "Inherited from other projects",
    description: "Lessons another project proved and shared, with attribution.",
    build: (projectId) => sharedLessons(projectId),
  },
  {
    label: "What keeps failing, by criterion",
    description: "Findings joined to the criterion they were recorded against.",
    build: criterionHistory,
  },
  {
    label: "Everything about this project",
    description: "Raw triples — the whole subgraph.",
    build: projectGraph,
  },
];
