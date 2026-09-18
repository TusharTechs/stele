/**
 * The cross-project claim, measured.
 *
 * Showing that one studio *can discover* another's lessons is half an argument. This runs the other
 * half: a different studio identity, a different subject, briefed cold — then the same brief again
 * after adopting knowledge that another production proved, with nothing else changed.
 *
 *   npm run warm-start -- --cold     # attempt 1, knowing nothing
 *   npm run warm-start -- --adopt <id>   # adopt inherited lessons, then run again
 */
import { createProject, offerInheritedLessons } from "@/core/intake";
import { runProduction } from "@/core/pipeline";
import { loadProject, updateProject } from "@/core/store";
import { knowledgeStore } from "@/dkg/client";
import { BriefSchema } from "@/core/schemas";

const args = Object.fromEntries(
  process.argv.slice(2).flatMap((a, i, all) =>
    a.startsWith("--") ? [[a.slice(2), all[i + 1]?.startsWith("--") === false ? all[i + 1] : "true"]] : []
  )
) as Record<string, string>;

const store = knowledgeStore();
console.log(`store: ${store.mode} — ${(await store.status()).detail}\n`);

let projectId = args.adopt && args.adopt !== "true" ? args.adopt : undefined;

if (!projectId) {
  const project = await createProject({
    agentLabel: "studio-b",
    brief: BriefSchema.parse({
      goal: "A three-shot teaser for a cast-iron pour-over kettle on a bare plaster shelf.",
      audience: "Specialty coffee buyers",
      styleNote: "Single soft north light, deep falloff into shadow, muted earth palette.",
      criteria: [
        { index: 0, body: "The kettle is unmistakably the hero of every frame" },
        { index: 1, body: "The lighting, finish and surface stay identical across all three shots" },
        { index: 2, body: "Each shot uses a visibly different framing, so the three do not read as one repeated angle" },
        { index: 3, body: "The mood is quiet and unhurried, never busy or commercial" },
      ],
      avoid: ["on-screen text or logos", "cluttered props", "steam or pouring liquid"],
      shotCount: 3,
      shotSeconds: 6,
      targetScore: 9,
      narration: false,
      music: false,
    }),
  });
  projectId = project.id;
  console.log(`created ${projectId} — "${project.title}" as ${project.agentLabel}`);

  const offers = await offerInheritedLessons(project);
  console.log(`\n${offers.length} lesson(s) offered from other productions:`);
  for (const o of offers) console.log(`  from "${o.originProjectTitle}" (${o.originAgent}): ${o.body.slice(0, 74)}`);
  console.log(`\nNone adopted yet — this attempt runs cold.\n`);
}

if (args.adopt && args.adopt !== "true") {
  const project = await loadProject(projectId)!;
  const offers = await offerInheritedLessons(project!);
  if (offers.length === 0) console.log("nothing left to inherit");
  const adopted = await updateProject(projectId, (cur) => ({
    ...cur,
    // Adopted as accepted, standing in for the curator clicking Adopt then Accept in the studio.
    lessons: [...cur.lessons, ...offers.map((o) => ({ ...o, status: "accepted" as const, curatedBy: "cli", curatedAt: Date.now() }))],
    inheritedLessonIds: [...new Set([...cur.inheritedLessonIds, ...offers.map((o) => o.id)])],
    canonVersion: cur.canonVersion + 1,
  }));
  await store.write(adopted);
  console.log(`adopted ${offers.length} inherited lesson(s) from other productions\n`);
}

const run = await runProduction({
  projectId,
  onEvent: (e) => {
    if (e.type === "stage" && e.detail) console.log(`  [${e.stage}] ${e.detail}`);
    else if (e.type === "shot") console.log(`    shot ${e.index}: ${e.status}${e.detail ? ` — ${e.detail}` : ""}`);
    else if (e.type === "error") console.log(`  ERROR ${e.message}`);
  },
});

console.log(`\nattempt ${run.attempt}: ${run.stage}`);
if (run.review) {
  console.log(`score ${run.review.score}/10 — ${run.review.summary}`);
  for (const v of run.review.verdicts) console.log(`  criterion ${v.index}: ${v.met ? "met" : "UNMET"} — ${v.note}`);
}
const inherited = run.basePrompt?.clauses.filter((c) => c.sourceKind === "lesson" && c.originProjectId && c.originProjectId !== projectId) ?? [];
console.log(`\nclauses: ${run.basePrompt?.clauses.length}, learned ${run.basePrompt?.memoryClauseCount}, of which inherited from another project: ${inherited.length}`);
for (const c of inherited) console.log(`   <- ${c.body.slice(0, 74)}`);
console.log(`\ncost $${run.costUSD.toFixed(4)}\nproject id: ${projectId}`);
