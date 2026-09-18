/**
 * Drive a production from the command line, with no browser involved.
 *
 * The engine is deliberately independent of the UI, so this is both the fastest way to exercise the
 * whole loop and the honest way to check it: if a claim in the README can be produced by this
 * script, it is a property of the system rather than of the screenshot.
 *
 *   npm run run:cli -- --shots 1 --goal "..." --criteria "a|b"
 *   npm run run:cli -- --project <id>            # another attempt
 *   npm run run:cli -- --project <id> --control  # memory withheld
 */

import { createProject } from "@/core/intake";
import { runProduction } from "@/core/pipeline";
import { loadProject, updateProject } from "@/core/store";
import { knowledgeStore } from "@/dkg/client";
import { BriefSchema } from "@/core/schemas";

const args = parseArgs(process.argv.slice(2));

const store = knowledgeStore();
const status = await store.status();
console.log(`knowledge store: ${status.mode} — ${status.detail}`);

let projectId = args.project;

if (!projectId) {
  const criteria = (args.criteria ?? "The subject is unmistakably the hero of the frame|The look is consistent across every shot")
    .split("|")
    .map((body, index) => ({ index, body: body.trim() }));

  const brief = BriefSchema.parse({
    goal: args.goal ?? "A calm, premium product film for a matte-black ceramic coffee cup on pale concrete.",
    audience: args.audience ?? "Design-literate buyers browsing a homepage",
    styleNote: args.style ?? "Soft directional window light, cool neutral palette, shallow depth of field, no text.",
    criteria,
    avoid: (args.avoid ?? "on-screen text or logos|harsh contrast").split("|").map((s) => s.trim()),
    shotCount: Number(args.shots ?? 1),
    shotSeconds: Number(args.seconds ?? 6),
    targetScore: Number(args.target ?? 8),
    narration: args.narration === "true",
    music: args.music === "true",
  });

  console.log("\ncreating project…");
  const project = await createProject({ brief, agentLabel: args.agent ?? "studio-a" });
  projectId = project.id;
  console.log(`project ${project.id} — "${project.title}"`);
  console.log(`canon: ${project.constraints.length} constraints`);
  for (const c of project.constraints) console.log(`  [${c.kind} ${c.weight}] ${c.body}`);
}

// Accepting every proposed lesson is a scripted stand-in for the curation step the studio does by
// hand. Without it a second attempt would compile from the same knowledge as the first, and the
// comparison would be meaningless.
if (args.accept === "true") {
  const updated = await updateProject(projectId, (project) => ({
    ...project,
    lessons: project.lessons.map((l) => (l.status === "proposed" ? { ...l, status: "accepted" as const, curatedBy: "cli", curatedAt: Date.now() } : l)),
    canonVersion: project.canonVersion + 1,
  }));
  await store.write(updated);
  console.log(`accepted ${updated.lessons.filter((l) => l.status === "accepted").length} lesson(s)`);
}

console.log(`\nrunning attempt on ${projectId}${args.control === "true" ? " (memory withheld)" : ""}…\n`);

const run = await runProduction({
  projectId,
  withholdMemory: args.control === "true",
  onEvent: (event) => {
    if (event.type === "stage") console.log(`  [${event.stage}]${event.detail ? ` ${event.detail}` : ""}`);
    else if (event.type === "shot") console.log(`    shot ${event.index}: ${event.status}${event.detail ? ` — ${event.detail}` : ""}`);
    else if (event.type === "error") console.log(`  ERROR ${event.message}`);
  },
});

console.log(`\nattempt ${run.attempt}: ${run.stage}`);
if (run.error) console.log(`error: ${run.error}`);
if (run.cutUrl) console.log(`cut: ${run.cutUrl}`);
if (run.review) {
  console.log(`score: ${run.review.score}/10 — ${run.review.summary}`);
  for (const v of run.review.verdicts) console.log(`  criterion ${v.index}: ${v.met ? "met" : "UNMET"} — ${v.note}`);
}
console.log(`cost: $${run.costUSD.toFixed(4)} across ${run.calls.length} network calls`);

if (run.basePrompt) {
  console.log(`\nprompt: ${run.basePrompt.clauses.length} clauses, ${run.basePrompt.memoryClauseCount} from the graph`);
  for (const clause of run.basePrompt.clauses) {
    const origin = clause.sourceKind === "lesson" ? ` <- lesson from attempt ${clause.sourceAttempt}` : ` <- ${clause.sourceKind}`;
    console.log(`  ${clause.index}. [${clause.role}] ${clause.body}${origin}`);
  }
}

const after = await loadProject(projectId);
const proposed = after?.lessons.filter((l) => l.status === "proposed") ?? [];
if (proposed.length) {
  console.log(`\n${proposed.length} lesson(s) proposed (steering nothing until accepted):`);
  for (const l of proposed) console.log(`  [${l.kind} ${l.confidence}] ${l.body}`);
}

console.log(`\nproject id: ${projectId}`);

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    // A bare flag means true; anything else consumes the following token as its value.
    if (!next || next.startsWith("--")) out[key] = "true";
    else {
      out[key] = next;
      i++;
    }
  }
  return out;
}
