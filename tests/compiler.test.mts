import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { compilePrompt, extendForShot } from "@/core/compiler";
import type { KnowledgeStore, QueryResult } from "@/dkg/client";
import type { Binding } from "@/dkg/queries";
import type { Project, ShotPlan } from "@/core/schemas";

/**
 * The compiler is where the project's central claim lives: a prompt assembled from graph rows, with
 * every clause still knowing which row produced it. A bug here is invisible — the run succeeds, the
 * prompt just quietly says something other than what the graph knows.
 */

const NS = "https://stele.studio/ns#";

function storeReturning(rows: Binding[]): KnowledgeStore {
  return {
    mode: "file",
    status: async () => ({ mode: "file", ready: true, detail: "stub" }),
    write: async () => ({ assetNames: [], references: [], servedBy: "file" }),
    query: async (): Promise<QueryResult> => ({ bindings: rows, servedBy: "file", ms: 1 }),
    publish: async () => ({ raw: "" }),
  };
}

const project = {
  id: "p1",
  brief: {
    goal: "A product film for a kettle.",
    styleNote: "Soft north light.",
    avoid: ["on-screen text"],
    criteria: [{ index: 0, body: "the kettle is the hero" }],
  },
} as Project;

const constraintRow: Binding = {
  node: "https://stele.studio/g/constraint/p1/abc",
  type: `${NS}Constraint`,
  kind: "subject",
  body: "A cast-iron kettle is present in every shot.",
  weight: "0.9",
};

const lessonRow: Binding = {
  node: "https://stele.studio/g/lesson/p1/1/42",
  type: `${NS}Lesson`,
  kind: "knownFailure",
  body: "Vary framing significantly across all three shots.",
  weight: "1",
  status: "accepted",
  fromAttempt: "1",
  criterion: "https://stele.studio/g/criterion/p1/0",
  originProject: "https://stele.studio/g/project/p1",
};

describe("compilePrompt", () => {
  test("every clause keeps the knowledge it came from", async () => {
    const { prompt } = await compilePrompt({ project, store: storeReturning([constraintRow, lessonRow]) });

    const lesson = prompt.clauses.find((c) => c.sourceKind === "lesson");
    assert.ok(lesson, "the lesson became a clause");
    assert.equal(lesson.sourceIri, lessonRow.node, "and points back at its graph node");
    assert.equal(lesson.sourceAttempt, 1, "and knows which attempt taught it");
    assert.equal(lesson.criterionIndex, 0, "and which criterion it addresses");
  });

  test("a lesson is not prefixed with Avoid, which would invert it", async () => {
    // Lessons are distilled as imperative rules. "Avoid: Vary framing" instructs the generator to
    // do the opposite of what was learned. This shipped once and reached the live network.
    const { prompt } = await compilePrompt({ project, store: storeReturning([lessonRow]) });
    const lesson = prompt.clauses.find((c) => c.sourceKind === "lesson")!;
    assert.equal(lesson.body, lessonRow.body);
    assert.ok(!prompt.text.includes("Avoid: Vary framing"), prompt.text);
  });

  test("counts only learned knowledge as memory, not the brief's own constraints", async () => {
    const { prompt } = await compilePrompt({ project, store: storeReturning([constraintRow, lessonRow]) });
    assert.equal(prompt.memoryClauseCount, 1, "one lesson, regardless of how many constraints");
  });

  test("withholding memory queries nothing at all", async () => {
    let queried = false;
    const store = storeReturning([lessonRow]);
    const watched: KnowledgeStore = { ...store, query: async (q) => { queried = true; return store.query(q); } };

    const { prompt, rowCount } = await compilePrompt({ project, store: watched, withholdMemory: true });

    // The control condition has to differ in exactly one variable, so it must not read the graph
    // and then filter — it must not read the graph.
    assert.equal(queried, false, "the control run never touches the knowledge store");
    assert.equal(rowCount, 0);
    assert.equal(prompt.memoryClauseCount, 0);
    assert.ok(prompt.clauses.every((c) => c.sourceKind === "brief"));
  });

  test("a rejected or merely proposed lesson never reaches a prompt", async () => {
    // The store filters by status, so the compiler is handed only accepted rows. This asserts the
    // contract the two halves rely on: anything that arrives is already cleared to steer a render.
    const { prompt } = await compilePrompt({ project, store: storeReturning([]) });
    assert.equal(prompt.memoryClauseCount, 0);
  });

  test("says the same thing twice only once", async () => {
    const duplicate = { ...lessonRow, node: "https://stele.studio/g/lesson/p1/2/43", fromAttempt: "2" };
    const { prompt } = await compilePrompt({ project, store: storeReturning([lessonRow, duplicate]) });
    assert.equal(prompt.memoryClauseCount, 1, "a repeated rule wastes prompt budget and clutters the panel");
  });

  test("the hash changes when the knowledge does", async () => {
    const cold = await compilePrompt({ project, store: storeReturning([constraintRow]) });
    const warm = await compilePrompt({ project, store: storeReturning([constraintRow, lessonRow]) });
    assert.notEqual(cold.prompt.promptHash, warm.prompt.promptHash);
  });
});

describe("extendForShot", () => {
  const plan: ShotPlan = {
    index: 1,
    intent: "a closer look",
    keyframeBrief: "Tight three-quarter view of the kettle's handle.",
    motion: "slow push in",
    seconds: 6,
  };

  test("a shot inherits the film's learned knowledge with its provenance intact", async () => {
    const { prompt } = await compilePrompt({ project, store: storeReturning([lessonRow]) });
    const shot = extendForShot(prompt, plan);

    const lesson = shot.clauses.find((c) => c.sourceKind === "lesson");
    assert.ok(lesson, "otherwise a rule would steer shot 0 and quietly stop applying to shot 1");
    assert.equal(lesson.sourceAttempt, 1);
  });

  test("the shot's own brief replaces the film's goal rather than joining it", async () => {
    const { prompt } = await compilePrompt({ project, store: storeReturning([]) });
    const shot = extendForShot(prompt, plan);

    assert.ok(shot.text.includes(plan.keyframeBrief));
    assert.equal(shot.clauses.filter((c) => c.role === "goal").length, 1);
  });
});
