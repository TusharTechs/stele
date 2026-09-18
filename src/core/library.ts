import { listProjects } from "./store";
import type { Lesson, Project } from "./schemas";

/**
 * Everything the studio knows, gathered across every production.
 *
 * A rule proved on one film is the asset here, not the film. Seeing them together — with how often
 * each has actually steered a render, which production proved it, and who let it in — is the
 * difference between a tool that keeps notes and a house style someone could standardise on.
 *
 * "Used" means a clause compiled from that rule reached a provider, counted from each run's recorded
 * clause list. A rule sitting accepted in a canon that never survived deduplication into a prompt
 * has changed nothing, and counting it would overstate what the canon is worth.
 */

export interface LibraryRule {
  id: string;
  body: string;
  kind: Lesson["kind"];
  status: Lesson["status"];
  confidence: number;
  projectId: string;
  projectTitle: string;
  agentLabel: string;
  learnedFromAttempt: number;
  curatedBy?: string;
  /** Set when this rule was proved somewhere else and adopted here. */
  originProjectId?: string;
  originProjectTitle?: string;
  /** How many renders compiled a clause from this rule. */
  timesUsed: number;
  /** Criterion this rule was written to fix, if any. */
  fixes?: string;
}

export interface LibrarySummary {
  rules: LibraryRule[];
  projects: Array<{ id: string; title: string; agentLabel: string }>;
  totals: {
    productions: number;
    steering: number;
    proposed: number;
    rejected: number;
    travelled: number;
  };
}

export async function buildLibrary(): Promise<LibrarySummary> {
  const projects = await listProjects();
  const rules: LibraryRule[] = [];

  for (const project of projects) {
    const usage = countClauseUse(project);

    for (const lesson of project.lessons) {
      rules.push({
        id: `${project.id}:${lesson.id}`,
        body: lesson.body,
        kind: lesson.kind,
        status: lesson.status,
        confidence: lesson.confidence,
        projectId: project.id,
        projectTitle: project.title,
        agentLabel: project.agentLabel,
        learnedFromAttempt: lesson.learnedFromAttempt,
        curatedBy: lesson.curatedBy,
        originProjectId: lesson.originProjectId,
        originProjectTitle: lesson.originProjectTitle,
        timesUsed: usage.get(normalise(lesson.body)) ?? 0,
        fixes:
          lesson.criterionIndex !== undefined
            ? project.brief.criteria.find((c) => c.index === lesson.criterionIndex)?.body
            : undefined,
      });
    }
  }

  // Most-used first, then the ones a human has actually blessed, then strength of evidence. A rule
  // that has steered eight renders is worth more attention than one accepted this morning.
  rules.sort(
    (a, b) =>
      b.timesUsed - a.timesUsed ||
      statusRank(b.status) - statusRank(a.status) ||
      b.confidence - a.confidence
  );

  const travelled = rules.filter((r) => r.originProjectId && r.originProjectId !== r.projectId).length;

  return {
    rules,
    projects: projects.map((p) => ({ id: p.id, title: p.title, agentLabel: p.agentLabel })),
    totals: {
      productions: projects.length,
      steering: rules.filter((r) => r.status === "accepted" || r.status === "pinned").length,
      proposed: rules.filter((r) => r.status === "proposed").length,
      rejected: rules.filter((r) => r.status === "rejected").length,
      travelled,
    },
  };
}

/** How many of this project's runs compiled a clause whose text matches each rule. */
function countClauseUse(project: Project): Map<string, number> {
  const counts = new Map<string, number>();
  for (const run of project.runs) {
    // One run counts once per rule however many shots repeated the clause.
    const seen = new Set<string>();
    for (const clause of run.basePrompt?.clauses ?? []) {
      if (clause.sourceKind !== "lesson") continue;
      const key = normalise(clause.body);
      if (seen.has(key)) continue;
      seen.add(key);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

function statusRank(status: Lesson["status"]): number {
  return status === "pinned" ? 3 : status === "accepted" ? 2 : status === "proposed" ? 1 : 0;
}

function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------- spend

export interface CapabilitySpend {
  capability: string;
  calls: number;
  failures: number;
  usd: number;
  totalMs: number;
}

export interface LedgerSummary {
  byCapability: CapabilitySpend[];
  byProject: Array<{ id: string; title: string; attempts: number; usd: number; calls: number }>;
  totalUSD: number;
  totalCalls: number;
  failedCalls: number;
  /** What was spent on attempts that never produced a reviewable cut. */
  wastedUSD: number;
  warnings: Array<{ capability: string; message: string; count: number }>;
}

/**
 * Where the money went, across every production.
 *
 * Built from the network's own `cost_usd_estimated` on each recorded call, so this is what was
 * billed rather than a local price table's guess. Failed calls are counted rather than hidden: a
 * provider that accepted a job and then failed still charged for it, and a ledger that quietly drops
 * those is not a ledger.
 */
export async function buildLedger(): Promise<LedgerSummary> {
  const projects = await listProjects();

  const byCapability = new Map<string, CapabilitySpend>();
  const warnings = new Map<string, { capability: string; message: string; count: number }>();
  const byProject: LedgerSummary["byProject"] = [];

  let totalUSD = 0;
  let totalCalls = 0;
  let failedCalls = 0;
  let wastedUSD = 0;

  for (const project of projects) {
    let projectUSD = 0;
    let projectCalls = 0;

    for (const run of project.runs) {
      const unreviewed = !run.review;
      for (const call of run.calls) {
        const entry = byCapability.get(call.capability) ?? {
          capability: call.capability,
          calls: 0,
          failures: 0,
          usd: 0,
          totalMs: 0,
        };
        entry.calls++;
        entry.usd += call.costUSD;
        entry.totalMs += call.latencyMs;
        if (!call.ok) entry.failures++;
        byCapability.set(call.capability, entry);

        for (const warning of call.warnings) {
          const key = `${call.capability}|${warning.message}`;
          const existing = warnings.get(key);
          if (existing) existing.count++;
          else warnings.set(key, { capability: call.capability, message: warning.message, count: 1 });
        }

        totalUSD += call.costUSD;
        projectUSD += call.costUSD;
        totalCalls++;
        projectCalls++;
        if (!call.ok) failedCalls++;
        if (unreviewed) wastedUSD += call.costUSD;
      }
    }

    byProject.push({
      id: project.id,
      title: project.title,
      attempts: project.runs.length,
      usd: projectUSD,
      calls: projectCalls,
    });
  }

  return {
    byCapability: [...byCapability.values()].sort((a, b) => b.usd - a.usd),
    byProject: byProject.sort((a, b) => b.usd - a.usd),
    totalUSD,
    totalCalls,
    failedCalls,
    wastedUSD,
    warnings: [...warnings.values()].sort((a, b) => b.count - a.count),
  };
}

// ---------------------------------------------------------------- assets

export interface GalleryItem {
  id: string;
  kind: "cut" | "shot" | "keyframe" | "stamped";
  url: string;
  posterUrl?: string;
  projectId: string;
  projectTitle: string;
  attempt: number;
  shotIndex?: number;
  intent?: string;
  capability: string;
  score?: number;
  targetScore: number;
  costUSD: number;
  memoryClauseCount: number;
  memoryWithheld: boolean;
  /** Set on a keyframe that was edited from the film's anchor rather than generated fresh. */
  derivedFromAnchor: boolean;
  at: number;
}

/**
 * Everything this studio has made, newest first.
 *
 * Ordered by attempt rather than grouped by production, so the gallery reads as a body of work
 * instead of a filing cabinet. Each item keeps the score it earned and whether the render that
 * produced it was steered by learned knowledge, because a frame is more interesting when you can see
 * what the machine knew when it made it.
 */
export async function buildGallery(): Promise<GalleryItem[]> {
  const projects = await listProjects();
  const items: GalleryItem[] = [];

  for (const project of projects) {
    for (const run of project.runs) {
      const shared = {
        projectId: project.id,
        projectTitle: project.title,
        attempt: run.attempt,
        targetScore: project.brief.targetScore,
        memoryClauseCount: run.basePrompt?.memoryClauseCount ?? 0,
        memoryWithheld: run.memoryWithheld,
        at: run.finishedAt ?? run.startedAt,
      };

      const firstKeyframe = run.shots.find((s) => s.keyframeUrl)?.keyframeUrl;

      if (run.cutUrl) {
        items.push({
          ...shared,
          id: `${project.id}-${run.attempt}-cut`,
          kind: "cut",
          url: run.cutUrl,
          posterUrl: firstKeyframe,
          capability: "ffmpeg-concat",
          score: run.review?.score,
          costUSD: run.costUSD,
          derivedFromAnchor: false,
        });
      }

      if (run.stampedUrl) {
        items.push({
          ...shared,
          id: `${project.id}-${run.attempt}-stamped`,
          kind: "stamped",
          url: run.stampedUrl,
          posterUrl: firstKeyframe,
          capability: "hyperframes-lower-third",
          score: run.review?.score,
          costUSD: 0,
          derivedFromAnchor: false,
        });
      }

      for (const shot of run.shots) {
        const base = {
          ...shared,
          shotIndex: shot.index,
          intent: shot.intent,
          score: shot.review?.score,
          derivedFromAnchor: Boolean(shot.anchoredTo),
        };
        if (shot.videoUrl) {
          items.push({
            ...base,
            id: `${project.id}-${run.attempt}-${shot.index}-video`,
            kind: "shot",
            url: shot.videoUrl,
            posterUrl: shot.keyframeUrl,
            capability: shot.capability,
            costUSD: shot.costUSD,
          });
        }
        if (shot.keyframeUrl) {
          items.push({
            ...base,
            id: `${project.id}-${run.attempt}-${shot.index}-frame`,
            kind: "keyframe",
            url: shot.keyframeUrl,
            capability: shot.keyframeCapability ?? "flux-schnell",
            costUSD: 0,
          });
        }
      }
    }
  }

  return items.sort((a, b) => b.at - a.at);
}

// ---------------------------------------------------------------- comparison

export interface ComparableProject {
  id: string;
  title: string;
  agentLabel: string;
  note?: string;
  goal: string;
  attempts: number;
  bestScore?: number;
  firstScore?: number;
  targetScore: number;
  criteriaMet?: number;
  criteriaTotal: number;
  steeringRules: number;
  inheritedRules: number;
  totalUSD: number;
  cutUrl?: string;
  posterUrl?: string;
  ruleBodies: string[];
}

export async function buildComparables(): Promise<ComparableProject[]> {
  const projects = await listProjects();

  return projects.map((project) => {
    const scored = project.runs.filter((r) => r.review);
    const latest = scored.at(-1);
    const steering = project.lessons.filter((l) => l.status === "accepted" || l.status === "pinned");

    return {
      id: project.id,
      title: project.title,
      agentLabel: project.agentLabel,
      note: project.note,
      goal: project.brief.goal,
      attempts: project.runs.length,
      bestScore: scored.reduce<number | undefined>(
        (best, r) => (best === undefined || r.review!.score > best ? r.review!.score : best),
        undefined
      ),
      firstScore: scored[0]?.review?.score,
      targetScore: project.brief.targetScore,
      criteriaMet: latest?.review?.verdicts.filter((v) => v.met).length,
      criteriaTotal: project.brief.criteria.length,
      steeringRules: steering.length,
      inheritedRules: steering.filter((l) => l.originProjectId && l.originProjectId !== project.id).length,
      totalUSD: project.runs.reduce((sum, r) => sum + r.costUSD, 0),
      cutUrl: latest?.cutUrl,
      posterUrl: latest?.shots.find((s) => s.keyframeUrl)?.keyframeUrl,
      ruleBodies: steering.map((l) => normalise(l.body)),
    };
  });
}
