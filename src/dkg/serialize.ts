import type { Project, Run, ShotRecord } from "@/core/schemas";
import {
  PREFIXES,
  boolLit,
  contentHash,
  dateLit,
  decLit,
  intLit,
  iri,
  iriLit,
  lit,
  triples,
} from "./ontology";
import { assertSafe, safeReference, safeSourceUrl, safeText } from "./redact";

/**
 * Project state rendered as RDF.
 *
 * Two Knowledge Assets, because they answer different questions and have different audiences.
 *
 * The **Run Ledger** is evidence: what was attempted, by which capability, at what cost, what the
 * reviewer saw, and which clause of the prompt came from where. It is append-only in spirit — each
 * snapshot is cumulative, so an earlier attempt is never rewritten by a later one.
 *
 * The **Canon** is the knowledge that steers the next render: constraints the human set and lessons
 * the loop proposed, each carrying its status and its origin. This is the asset worth sharing, and
 * the one another project can usefully query.
 *
 * Both pass `assertSafe` before they are returned. Nothing reaches a store without going through
 * here.
 */

export function buildRunLedger(project: Project): string {
  const projectNode = iri.project(project.id);
  const agentNode = iri.agent(project.agentLabel);
  const lines: string[] = [PREFIXES];

  lines.push(
    triples(projectNode, [
      ["a", "st:Project"],
      ["st:title", lit(safeText(project.title, 160))],
      ["st:goalHash", lit(contentHash(project.brief.goal))],
      ["st:aspectRatio", lit(project.brief.aspectRatio)],
      ["st:shotCount", intLit(project.brief.shotCount)],
      ["st:targetScore", decLit(project.brief.targetScore)],
      ["st:criterionCount", intLit(project.brief.criteria.length)],
      ["st:attemptCount", intLit(project.runs.length)],
      ["st:authoredBy", agentNode],
      ["st:createdAt", dateLit(project.createdAt)],
      ["st:updatedAt", dateLit(project.updatedAt)],
    ])
  );

  lines.push(
    triples(agentNode, [
      ["a", "st:Agent"],
      ["st:label", lit(safeText(project.agentLabel, 64))],
      ["st:agentKind", lit("machine")],
    ])
  );

  // Criteria are shared by the ledger and the canon: a finding points at one, and so does a lesson.
  for (const criterion of project.brief.criteria) {
    lines.push(
      triples(iri.criterion(project.id, criterion.index), [
        ["a", "st:Criterion"],
        ["st:forProject", projectNode],
        ["st:criterionIndex", intLit(criterion.index)],
        ["st:body", lit(safeText(criterion.body, 240))],
      ])
    );
  }

  for (const source of project.sources) {
    const url = safeSourceUrl(source.url);
    if (!url) continue;
    lines.push(
      triples(iri.source(source.url), [
        ["a", "st:Source"],
        ["st:forProject", projectNode],
        ["st:url", lit(url)],
        ["st:retrievedAt", dateLit(source.retrievedAt)],
        ["st:excerptHash", lit(source.excerptHash)],
        ["st:claimCount", intLit(source.claimCount)],
        ["st:retrievalOk", boolLit(source.ok)],
      ])
    );
  }

  for (const run of project.runs) lines.push(runTriples(project, run));

  for (const seal of project.seals) {
    lines.push(
      triples(iri.run(project.id, seal.attempt), [
        ["st:sealedAt", dateLit(seal.sealedAt)],
        ["st:sealNetwork", lit(seal.network)],
        ["st:ual", seal.ual ? lit(seal.ual) : undefined],
      ])
    );
  }

  const turtle = `${lines.filter(Boolean).join("\n")}\n`;
  assertSafe(turtle);
  return turtle;
}

function runTriples(project: Project, run: Run): string {
  const runNode = iri.run(project.id, run.attempt);
  const lines: string[] = [];

  lines.push(
    triples(runNode, [
      ["a", "st:Run"],
      ["st:forProject", iri.project(project.id)],
      ["st:attempt", intLit(run.attempt)],
      ["st:canonVersion", intLit(run.canonVersion)],
      // The two flags that make the comparison meaningful.
      ["st:usedMemory", boolLit(!run.memoryWithheld && (run.basePrompt?.memoryClauseCount ?? 0) > 0)],
      ["st:memoryWithheld", boolLit(run.memoryWithheld)],
      ["st:memoryClauseCount", intLit(run.basePrompt?.memoryClauseCount ?? 0)],
      ["st:promptHash", run.basePrompt ? lit(run.basePrompt.promptHash) : undefined],
      ["st:costUSD", decLit(run.costUSD)],
      ["st:callCount", intLit(run.calls.length)],
      ["st:stage", lit(run.stage)],
      ["st:startedAt", dateLit(run.startedAt)],
      ["st:finishedAt", run.finishedAt ? dateLit(run.finishedAt) : undefined],
      ["st:pairedWith", run.pairedWithAttempt ? iri.run(project.id, run.pairedWithAttempt) : undefined],
      ["st:cutReference", refLit(run.cutUrl)],
    ])
  );

  // Clauses: the join between what the graph knew and what the provider was actually told.
  run.basePrompt?.clauses.forEach((clause) => {
    const clauseNode = iri.clause(project.id, run.attempt, clause.index);
    lines.push(`${runNode} st:usedClause ${clauseNode} .`);
    lines.push(
      triples(clauseNode, [
        ["a", "st:PromptClause"],
        ["st:clauseOrder", intLit(clause.index)],
        ["st:body", lit(safeText(clause.body, 300))],
        ["st:clauseRole", lit(clause.role)],
        ["st:sourceKind", lit(clause.sourceKind)],
        ["st:derivedFrom", iriLit(clause.sourceIri)],
        ["st:fromAttempt", clause.sourceAttempt !== undefined ? intLit(clause.sourceAttempt) : undefined],
        [
          "st:addressesCriterion",
          clause.criterionIndex !== undefined ? iri.criterion(project.id, clause.criterionIndex) : undefined,
        ],
      ])
    );
  });

  for (const shot of run.shots) lines.push(shotTriples(project, run, shot));

  if (run.review) {
    const reviewNode = iri.review(project.id, run.attempt);
    lines.push(`${runNode} st:hasReview ${reviewNode} .`);
    lines.push(
      triples(reviewNode, [
        ["a", "st:Review"],
        ["st:forRun", runNode],
        ["st:score", decLit(run.review.score)],
        ["st:passed", boolLit(run.review.passed)],
        ["st:reviewCapability", lit(run.review.capability)],
        ["st:summary", lit(safeText(run.review.summary))],
      ])
    );

    run.review.findings.forEach((finding) => {
      const findingNode = iri.finding(project.id, run.attempt, finding.index);
      lines.push(`${reviewNode} st:hasFinding ${findingNode} .`);
      lines.push(
        triples(findingNode, [
          ["a", "st:Finding"],
          ["st:fromAttempt", intLit(run.attempt)],
          ["st:body", lit(safeText(finding.body))],
          ["st:polarity", lit(finding.polarity)],
          [
            "st:aboutCriterion",
            finding.criterionIndex !== undefined
              ? iri.criterion(project.id, finding.criterionIndex)
              : undefined,
          ],
        ])
      );
    });

    // Met and missed are separate predicates rather than a boolean, so "which criteria has this
    // project never satisfied" is a pattern match instead of a filter.
    run.review.verdicts.forEach((verdict) => {
      const predicate = verdict.met ? "st:criterionMet" : "st:criterionMissed";
      lines.push(`${reviewNode} ${predicate} ${iri.criterion(project.id, verdict.index)} .`);
    });
  }

  return lines.filter(Boolean).join("\n");
}

function shotTriples(project: Project, run: Run, shot: ShotRecord): string {
  const shotNode = iri.artifact(project.id, run.attempt, `shot-${shot.index}`);
  const lines = [
    `${iri.run(project.id, run.attempt)} st:producedArtifact ${shotNode} .`,
    triples(shotNode, [
      ["a", "st:Artifact"],
      ["st:artifactIndex", intLit(shot.index)],
      ["st:mediaType", lit("video")],
      ["st:capability", lit(shot.capability)],
      ["st:reference", refLit(shot.videoUrl)],
      ["st:keyframeReference", refLit(shot.keyframeUrl)],
      ["st:contentHash", shot.videoUrl ? lit(contentHash(shot.videoUrl)) : undefined],
      ["st:promptHash", lit(shot.prompt.promptHash)],
      ["st:renderAttempts", intLit(shot.attempts)],
      ["st:artifactStatus", lit(shot.status)],
      ["st:costUSD", decLit(shot.costUSD)],
      ["st:shotScore", shot.review ? decLit(shot.review.score) : undefined],
    ]),
  ];
  return lines.join("\n");
}

export function buildCanon(project: Project): string {
  const canonNode = iri.canon(project.id);
  const projectNode = iri.project(project.id);
  const lines: string[] = [PREFIXES];

  const latestScore = project.runs.filter((r) => r.review).at(-1)?.review?.score;

  lines.push(
    triples(canonNode, [
      ["a", "st:Canon"],
      ["st:forProject", projectNode],
      ["st:canonVersion", intLit(project.canonVersion)],
      ["st:constraintCount", intLit(project.constraints.length)],
      ["st:lessonCount", intLit(project.lessons.length)],
      ["st:activeLessonCount", intLit(project.lessons.filter(isActive).length)],
      ["st:latestScore", latestScore !== undefined ? decLit(latestScore) : undefined],
      ["st:targetScore", decLit(project.brief.targetScore)],
      ["st:updatedAt", dateLit(project.updatedAt)],
      ["st:authoredBy", iri.agent(project.agentLabel)],
    ])
  );

  // Repeated from the ledger on purpose: the canon must stand alone when another project reads it.
  lines.push(
    triples(projectNode, [
      ["a", "st:Project"],
      ["st:title", lit(safeText(project.title, 160))],
      ["st:aspectRatio", lit(project.brief.aspectRatio)],
    ])
  );

  for (const criterion of project.brief.criteria) {
    lines.push(
      triples(iri.criterion(project.id, criterion.index), [
        ["a", "st:Criterion"],
        ["st:forProject", projectNode],
        ["st:criterionIndex", intLit(criterion.index)],
        ["st:body", lit(safeText(criterion.body, 240))],
      ])
    );
  }

  for (const constraint of project.constraints) {
    const node = iri.constraint(project.id, constraint.id);
    lines.push(`${canonNode} st:hasConstraint ${node} .`);
    lines.push(
      triples(node, [
        ["a", "st:Constraint"],
        ["st:forProject", projectNode],
        ["st:constraintKind", lit(constraint.kind)],
        ["st:body", lit(safeText(constraint.body, 300))],
        ["st:weight", decLit(constraint.weight)],
        ["st:authoredBy", iri.agent(constraint.authoredBy)],
        ["st:createdAt", dateLit(constraint.createdAt)],
      ])
    );
  }

  for (const lesson of project.lessons) {
    const node = iri.lesson(lesson.originProjectId ?? project.id, lesson.learnedFromAttempt, hashIndex(lesson.id));
    lines.push(`${canonNode} st:hasLesson ${node} .`);
    lines.push(
      triples(node, [
        ["a", "st:Lesson"],
        ["st:forProject", projectNode],
        ["st:lessonKind", lit(lesson.kind)],
        ["st:body", lit(safeText(lesson.body, 300))],
        // Status is part of the record: a rejected lesson stays visible, and stays out of prompts.
        ["st:status", lit(lesson.status)],
        ["st:confidence", decLit(lesson.confidence)],
        ["st:fromAttempt", intLit(lesson.learnedFromAttempt)],
        [
          "st:addressesCriterion",
          lesson.criterionIndex !== undefined ? iri.criterion(project.id, lesson.criterionIndex) : undefined,
        ],
        [
          "st:learnedFrom",
          iri.run(lesson.originProjectId ?? project.id, lesson.learnedFromAttempt),
        ],
        ["st:originProject", lesson.originProjectId ? iri.project(lesson.originProjectId) : projectNode],
        // Always carry a readable origin, falling back to this project's own title. A lesson that
        // travels to another studio should arrive saying which production proved it, and a bare id
        // is attribution nobody can act on.
        [
          "st:originProjectTitle",
          lit(safeText(lesson.originProjectTitle ?? project.title, 160)),
        ],
        ["st:originAgent", iri.agent(lesson.originAgent ?? project.agentLabel)],
        ["st:curatedBy", lesson.curatedBy ? iri.agent(lesson.curatedBy) : undefined],
        ["st:curatedAt", lesson.curatedAt ? dateLit(lesson.curatedAt) : undefined],
      ])
    );
  }

  const turtle = `${lines.filter(Boolean).join("\n")}\n`;
  assertSafe(turtle);
  return turtle;
}

function isActive(lesson: { status: string }): boolean {
  return lesson.status === "accepted" || lesson.status === "pinned";
}

/** Only references the network hosts become links; anything else is dropped rather than recorded. */
function refLit(url: string | undefined): string | undefined {
  const safe = safeReference(url);
  return safe ? lit(safe) : undefined;
}

/** Lesson ids are opaque strings; the IRI needs a short stable number for its final segment. */
function hashIndex(id: string): number {
  let acc = 0;
  for (let i = 0; i < id.length; i++) acc = (acc * 31 + id.charCodeAt(i)) >>> 0;
  return acc % 100000;
}
