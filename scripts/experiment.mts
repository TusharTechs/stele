/**
 * The paired comparison, repeated.
 *
 * One run per condition is an anecdote. This runs the same brief on N independent projects, each
 * cold and then warm, so the claim can be stated with a spread rather than a single number. Every
 * project is fresh, so a warm run inherits only what its own cold run taught it.
 *
 *   npm run experiment -- --repeats 3
 */
import { createProject } from "@/core/intake";
import { runProduction } from "@/core/pipeline";
import { loadProject, updateProject } from "@/core/store";
import { knowledgeStore } from "@/dkg/client";
import { BriefSchema, type Run } from "@/core/schemas";

const repeats = Number(process.argv[process.argv.indexOf("--repeats") + 1]) || 3;
const store = knowledgeStore();

const BRIEF = BriefSchema.parse({
  goal: "A three-shot teaser for a hand-thrown stoneware teapot, glazed deep indigo, on a bare plaster shelf.",
  audience: "Specialty homeware buyers",
  styleNote: "Single soft north light, deep falloff into shadow, muted earth palette, shallow depth of field.",
  criteria: [
    { index: 0, body: "The teapot is unmistakably the hero of every frame" },
    { index: 1, body: "The lighting, glaze colour and surface stay identical across all three shots" },
    { index: 2, body: "Each shot uses a visibly different framing, so the three do not read as one repeated angle" },
    { index: 3, body: "The mood is quiet and unhurried, never busy or commercial" },
  ],
  avoid: ["on-screen text or logos", "cluttered props", "steam or pouring liquid"],
  shotCount: 3,
  shotSeconds: 6,
  targetScore: 9,
  narration: false,
  music: false,
});

interface Outcome {
  replicate: number;
  cold?: Run;
  warm?: Run;
  projectId: string;
}

/**
 * Progress, because this runs for the better part of an hour.
 *
 * The first version printed nothing between "replicate 1 of 3" and the final table, which is
 * indistinguishable from a hang right up until it isn't.
 */
const log = (phase: string) => (event: Parameters<NonNullable<Parameters<typeof runProduction>[0]["onEvent"]>>[0]) => {
  const at = new Date().toISOString().slice(11, 19);
  if (event.type === "stage" && event.detail) console.log(`  ${at} ${phase} [${event.stage}] ${event.detail}`);
  else if (event.type === "stage") console.log(`  ${at} ${phase} [${event.stage}]`);
  else if (event.type === "shot") console.log(`  ${at} ${phase}   shot ${event.index} ${event.status}${event.detail ? ` · ${event.detail}` : ""}`);
  else if (event.type === "error") console.log(`  ${at} ${phase} ERROR ${event.message}`);
};

const outcomes: Outcome[] = [];

for (let i = 1; i <= repeats; i++) {
  console.log(`\n===== replicate ${i} of ${repeats} =====`);
  const project = await createProject({ brief: BRIEF, agentLabel: `studio-exp-${i}` });
  console.log(`project ${project.id} "${project.title}"`);

  const cold = await runProduction({ projectId: project.id, onEvent: log("cold") });
  console.log(`  cold: ${cold.stage} score=${cold.review?.score ?? "-"} cost=$${cold.costUSD.toFixed(2)}`);

  // The curation step, scripted. Without it the warm run compiles from the same canon as the cold one.
  const curated = await updateProject(project.id, (c) => ({
    ...c,
    lessons: c.lessons.map((l) =>
      l.status === "proposed" ? { ...l, status: "accepted" as const, curatedBy: "experiment", curatedAt: Date.now() } : l
    ),
    canonVersion: c.canonVersion + 1,
  }));
  await store.write(curated);
  console.log(`  accepted ${curated.lessons.filter((l) => l.status === "accepted").length} lesson(s)`);

  const warm = await runProduction({ projectId: project.id, onEvent: log("warm") });
  console.log(`  warm: ${warm.stage} score=${warm.review?.score ?? "-"} cost=$${warm.costUSD.toFixed(2)} learned=${warm.basePrompt?.memoryClauseCount ?? 0}`);

  outcomes.push({ replicate: i, cold, warm, projectId: project.id });
}

// ---------------------------------------------------------------- report

const met = (r?: Run) => r?.review?.verdicts.filter((v) => v.met).length ?? 0;
const score = (r?: Run) => r?.review?.score;

console.log(`\n\n===== ${repeats} replicates, same brief, ${BRIEF.criteria.length} criteria =====\n`);
console.log("rep |  cold score  warm score |  cold met  warm met |  cold cost  warm cost");
for (const o of outcomes) {
  console.log(
    `${String(o.replicate).padStart(3)} | ${String(score(o.cold) ?? "-").padStart(11)}${String(score(o.warm) ?? "-").padStart(12)} |` +
      `${String(met(o.cold)).padStart(10)}${String(met(o.warm)).padStart(10)} |` +
      `${("$" + (o.cold?.costUSD ?? 0).toFixed(2)).padStart(11)}${("$" + (o.warm?.costUSD ?? 0).toFixed(2)).padStart(11)}`
  );
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const coldScores = outcomes.map((o) => score(o.cold)).filter((n): n is number => n !== undefined);
const warmScores = outcomes.map((o) => score(o.warm)).filter((n): n is number => n !== undefined);
const coldMet = outcomes.map((o) => met(o.cold));
const warmMet = outcomes.map((o) => met(o.warm));

const range = (xs: number[]) => (xs.length ? `${Math.min(...xs)}–${Math.max(...xs)}` : "-");
console.log(`\nscore      cold mean ${mean(coldScores).toFixed(2)} (${range(coldScores)})   warm mean ${mean(warmScores).toFixed(2)} (${range(warmScores)})`);
console.log(`criteria   cold mean ${mean(coldMet).toFixed(2)} (${range(coldMet)})   warm mean ${mean(warmMet).toFixed(2)} (${range(warmMet)})`);
console.log(`cost       cold mean $${mean(outcomes.map((o) => o.cold?.costUSD ?? 0)).toFixed(2)}   warm mean $${mean(outcomes.map((o) => o.warm?.costUSD ?? 0)).toFixed(2)}`);
console.log(`\nprojects: ${outcomes.map((o) => o.projectId).join(" ")}`);
