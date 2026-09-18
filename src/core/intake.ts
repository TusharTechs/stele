import crypto from "node:crypto";
import { z } from "zod";
import { livepeer } from "@/livepeer/mcp-client";
import { think } from "@/livepeer/capabilities";
import { knowledgeStore } from "@/dkg/client";
import { sharedLessons } from "@/dkg/queries";
import { safeText } from "@/dkg/redact";
import { newProjectId, saveProject } from "./store";
import { BriefSchema, type Brief, type Constraint, type Lesson, type Project } from "./schemas";

/**
 * Starting a project: turning a brief into a canon, and offering it what other projects already know.
 *
 * Two things happen here that shape everything after. The brief's free text is decomposed into
 * discrete **constraints**, because a constraint is addressable — it can be edited, weighted, turned
 * off, and pointed at from a prompt clause, none of which is true of a paragraph. And the shared
 * graph is queried for lessons other projects have proved, so a new project can begin knowing
 * something rather than starting from zero.
 */

const IntakeSchema = z.object({
  title: z.string().min(2).max(80),
  constraints: z
    .array(
      z.object({
        kind: z.enum(["style", "subject", "avoid", "format"]),
        body: z.string().min(4).max(240),
        weight: z.number().min(0).max(1),
      })
    )
    .min(2)
    .max(10),
});

export async function createProject(input: {
  brief: Brief;
  agentLabel?: string;
  /**
   * Start from another production's canon.
   *
   * This is what a house style actually is: a set of rules someone proved on one film and wants on
   * the next. Copying them at intake, rather than offering them one at a time afterwards, is the
   * difference between a tool that remembers and a tool a studio can standardise on.
   */
  forkFrom?: Project;
}): Promise<Project> {
  const brief = BriefSchema.parse(input.brief);
  const agent = livepeer();
  const id = newProjectId();

  const prompt = [
    "You are setting up the production canon for a short film.",
    "",
    `Brief: ${brief.goal}`,
    brief.audience ? `Audience: ${brief.audience}` : "",
    brief.styleNote ? `House style: ${brief.styleNote}` : "",
    brief.avoid.length ? `To avoid: ${brief.avoid.join("; ")}` : "",
    "",
    "Success criteria:",
    ...brief.criteria.map((c) => `  ${c.index}. ${c.body}`),
    "",
    "Give the film a short title, and decompose the brief into separate binding constraints.",
    "  - One idea per constraint. A constraint that contains 'and' is usually two constraints.",
    "  - Write them as direction a generator can follow, concrete and visual.",
    "  - kind: subject for what must appear, style for how it should look, avoid for prohibitions, format for framing and duration.",
    "  - weight: how binding it is, 0 to 1. Reserve above 0.8 for things that would make the film wrong if broken.",
    "  - Do not restate the success criteria as constraints; they are judged separately.",
    "",
    'Return: {"title": "...", "constraints": [{"kind": "...", "body": "...", "weight": <0-1>}]}',
  ]
    .filter(Boolean)
    .join("\n");

  const { value } = await think(agent, "intake", prompt, IntakeSchema);

  const now = Date.now();
  const constraints: Constraint[] = value.constraints.map((c) => ({
    id: constraintId(c.body),
    kind: c.kind,
    body: safeText(c.body, 240),
    weight: c.weight,
    authoredBy: input.agentLabel ?? "studio-a",
    createdAt: now,
  }));

  // A forked canon arrives already accepted. The source studio reviewed these rules on their own
  // production; asking the same human to approve them again would be ceremony, and the graph still
  // records where each one came from.
  const inherited: Lesson[] = (input.forkFrom?.lessons ?? [])
    .filter((l) => l.status === "accepted" || l.status === "pinned")
    .map((l) => ({
      ...l,
      id: `forked-${constraintId(l.body)}`,
      status: "accepted" as const,
      originProjectId: l.originProjectId ?? input.forkFrom!.id,
      originProjectTitle: l.originProjectTitle ?? input.forkFrom!.title,
      originAgent: l.originAgent ?? input.forkFrom!.agentLabel,
      curatedBy: input.agentLabel ?? "studio-a",
      curatedAt: now,
    }));

  const forkedConstraints: Constraint[] = (input.forkFrom?.constraints ?? []).map((c) => ({
    ...c,
    id: `forked-${c.id}`,
    createdAt: now,
  }));

  // The new brief's own constraints win where they overlap, since they describe this film.
  const merged = [...constraints];
  for (const c of forkedConstraints) {
    if (!merged.some((m) => normalise(m.body) === normalise(c.body))) merged.push(c);
  }

  const project: Project = {
    id,
    title: safeText(value.title, 80),
    createdAt: now,
    updatedAt: now,
    agentLabel: input.agentLabel ?? "studio-a",
    brief,
    canonVersion: 1,
    constraints: merged,
    lessons: inherited,
    runs: [],
    sources: [],
    seals: [],
    inheritedLessonIds: inherited.map((l) => l.id),
    note: input.forkFrom
      ? `Started from the canon of "${input.forkFrom.title}", inheriting ${inherited.length} accepted rule(s) and ${forkedConstraints.length} constraint(s).`
      : undefined,
  };

  const saved = await saveProject(project);
  // Write the canon before the first render so the compiler has something to query, and so a
  // brand-new project is already visible in the graph rather than appearing only after a run.
  await knowledgeStore().write(saved).catch(() => undefined);
  return saved;
}

/**
 * Lessons other projects have proved, offered to this one.
 *
 * This is where knowledge crosses a project boundary. The rows come back through SPARQL against
 * shared memory, carrying the project and agent that established each one — so what arrives is
 * attributable knowledge, not an anonymous string. Nothing is adopted automatically: an inherited
 * lesson lands as `proposed`, exactly like one this project learned itself, and waits for a human.
 *
 * Confidence is discounted on the way in. A rule proved on someone else's film is real evidence, but
 * it is weaker evidence here than it was there, and it should not outrank this project's own
 * findings before it has earned it.
 */
export async function offerInheritedLessons(
  project: Project
): Promise<Array<Lesson & { originAgent?: string }>> {
  const store = knowledgeStore();
  const { bindings } = await store.query(sharedLessons(project.id));

  const known = new Set(project.lessons.map((l) => normalise(l.body)));
  const offers: Lesson[] = [];

  for (const row of bindings) {
    const body = row.body?.trim();
    if (!body || known.has(normalise(body))) continue;
    known.add(normalise(body));

    offers.push({
      id: `inherited-${constraintId(body)}`,
      kind: (row.kind as Lesson["kind"]) ?? "constraint",
      body: safeText(body, 240),
      status: "proposed",
      confidence: Math.max(0.1, Number(row.confidence ?? 0.5) * 0.7),
      learnedFromAttempt: Number(row.fromAttempt ?? 0),
      originProjectId: projectIdFromIri(row.originProject),
      originProjectTitle: row.originTitle,
      originAgent: labelFromIri(row.originAgent),
    });
  }

  return offers;
}

function constraintId(body: string): string {
  return crypto.createHash("sha256").update(normalise(body)).digest("hex").slice(0, 12);
}

function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

function projectIdFromIri(value: string | undefined): string | undefined {
  return value?.split("/").pop() || undefined;
}

function labelFromIri(value: string | undefined): string | undefined {
  return value?.split("/").pop() || undefined;
}
