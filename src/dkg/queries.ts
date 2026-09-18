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
  // Written without UNION deliberately. The DKG node's query engine returns zero rows for a UNION
  // that both oxigraph and the spec answer correctly, and in the hot path that failure is silent
  // and total: the compiler would receive nothing, every prompt would fall back to the brief, and
  // the run would still report success. `VALUES` over the two types is equivalent, and both stores
  // answer it identically — which is the property that actually matters here.
  return `${SPARQL_PREFIXES}
SELECT ?node ?type ?kind ?body ?weight ?status ?fromAttempt ?criterion ?originProject ?originTitle
WHERE {
  VALUES ?type { st:Constraint st:Lesson }
  ?node a ?type ;
        st:forProject ${project} ;
        st:body ?body .
  OPTIONAL { ?node st:constraintKind ?constraintKind }
  OPTIONAL { ?node st:lessonKind ?lessonKind }
  OPTIONAL { ?node st:weight ?constraintWeight }
  OPTIONAL { ?node st:confidence ?lessonConfidence }
  OPTIONAL { ?node st:status ?status }
  OPTIONAL { ?node st:fromAttempt ?fromAttempt }
  OPTIONAL { ?node st:addressesCriterion ?criterion }
  OPTIONAL { ?node st:originProject ?originProject }
  OPTIONAL { ?node st:originProjectTitle ?originTitle }
  BIND(COALESCE(?constraintKind, ?lessonKind) AS ?kind)
  BIND(COALESCE(?constraintWeight, ?lessonConfidence) AS ?weight)
  # A constraint has no status and always applies. A lesson steers nothing until a human accepts it.
  FILTER (!BOUND(?status) || ?status = "accepted" || ?status = "pinned")
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
  const project = iri.project(projectId);
  // UNION-free for the same reason as `memoryForCompile`: the node's engine answers it with nothing.
  return `${SPARQL_PREFIXES}
SELECT ?subject ?predicate ?object
WHERE {
  ?subject ?predicate ?object .
  OPTIONAL { ?subject st:forProject ?ownedBy }
  FILTER (?subject = ${project} || (BOUND(?ownedBy) && ?ownedBy = ${project}))
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

/**
 * The project's knowledge as typed nodes and the edges between them.
 *
 * Only edges whose object is itself a typed node come back, which quietly drops every literal and
 * leaves the shape of the graph rather than its contents. That is what makes the result drawable:
 * a picture of 4,000 string literals is not a picture of anything.
 */
export function projectShape(projectId: string, limit = 300): string {
  const project = iri.project(projectId);
  return `${SPARQL_PREFIXES}
SELECT ?s ?sType ?p ?o ?oType ?sBody ?oBody
WHERE {
  ?s ?p ?o .
  ?s a ?sType .
  ?o a ?oType .
  ?s st:forProject ${project} .
  OPTIONAL { ?s st:body ?sBody }
  OPTIONAL { ?o st:body ?oBody }
}
LIMIT ${limit}`;
}

/** Everything the graph says about one node. The click-through behind the picture. */
export function describeNode(nodeIri: string): string {
  return `${SPARQL_PREFIXES}
SELECT ?predicate ?object
WHERE { <${nodeIri}> ?predicate ?object }
ORDER BY ?predicate`;
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
    description: "Raw triples. The whole subgraph.",
    build: projectGraph,
  },
  {
    label: "The shape of the graph",
    description: "Typed nodes and the edges between them. This is what the picture is drawn from.",
    build: (projectId) => projectShape(projectId),
  },
];
