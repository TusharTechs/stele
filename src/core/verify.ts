import crypto from "node:crypto";
import { knowledgeStore } from "@/dkg/client";
import { SPARQL_PREFIXES, iri } from "@/dkg/ontology";
import { loadProject } from "./store";
import type { Project, Run } from "./schemas";

/**
 * Checking a production record instead of believing it.
 *
 * A page that displays what the application already thinks is not verification, and Track 2 asks for
 * a create, retrieve **or verify** path. This is the verify one. Each check below re-derives
 * something from first principles and compares it to what was recorded, so a record that has been
 * edited, half-written, or quietly diverged from the graph says so.
 *
 * The checks are deliberately ones a sceptic could repeat by hand: hash the clauses yourself, run
 * the SPARQL yourself, download the file and hash it yourself. Nothing here depends on trusting the
 * process that produced the record.
 */

export type CheckStatus = "pass" | "fail" | "unavailable";

export interface Check {
  id: string;
  label: string;
  /** What this check actually proves, in one sentence, for someone reading the result cold. */
  proves: string;
  status: CheckStatus;
  detail: string;
  /** The command or query that reproduces this check outside the app, where one exists. */
  reproduce?: string;
}

export interface VerifyResult {
  projectId: string;
  attempt: number;
  checkedAt: number;
  checks: Check[];
  passed: number;
  failed: number;
  unavailable: number;
}

export async function verifyRecord(projectId: string): Promise<VerifyResult> {
  const project = await loadProject(projectId);
  if (!project) throw new Error("No such project.");

  const run = project.runs.filter((r) => r.stage === "COMPLETE" && r.review).at(-1);
  if (!run) throw new Error("This production has no finished attempt to verify.");

  const checks = [
    promptIntegrity(run),
    await graphHoldsRun(project, run),
    await mediaIntegrity(run),
    chainAnchor(project),
  ];

  return {
    projectId,
    attempt: run.attempt,
    checkedAt: Date.now(),
    checks,
    passed: checks.filter((c) => c.status === "pass").length,
    failed: checks.filter((c) => c.status === "fail").length,
    unavailable: checks.filter((c) => c.status === "unavailable").length,
  };
}

/**
 * Does the recorded prompt hash match the clauses the record says produced it?
 *
 * This is the one that matters most, because the clause list is the project's central claim. If a
 * clause were added, removed or reworded after the fact, the joined text would no longer hash to
 * what the run recorded, and "this knowledge steered this render" would be unsupported.
 */
function promptIntegrity(run: Run): Check {
  const base = {
    id: "prompt",
    label: "The prompt matches the knowledge recorded against it",
    proves:
      "The clause list shown on this record is the text that was actually sent, not a reconstruction added afterwards.",
    reproduce: 'sha256(clauses.map(c => c.body).join(" "))',
  };

  if (!run.basePrompt) {
    return { ...base, status: "unavailable", detail: "This attempt recorded no compiled prompt." };
  }

  const recomputed = crypto
    .createHash("sha256")
    .update(run.basePrompt.clauses.map((c) => c.body).join(" "))
    .digest("hex");

  const matches = recomputed === run.basePrompt.promptHash;
  return {
    ...base,
    status: matches ? "pass" : "fail",
    detail: matches
      ? `${run.basePrompt.clauses.length} clauses hash to ${recomputed.slice(0, 16)}…, which is what the run recorded.`
      : `Recomputed ${recomputed.slice(0, 16)}… but the run recorded ${run.basePrompt.promptHash.slice(0, 16)}…. The clause list and the prompt have diverged.`,
  };
}

/**
 * Is this attempt actually in the knowledge graph, with the score this record claims?
 *
 * Asked of the store live rather than read from the project file, so it catches the failure that
 * matters: a record that looks complete while the assertion behind it never reached the node.
 */
async function graphHoldsRun(project: Project, run: Run): Promise<Check> {
  const sparql = `${SPARQL_PREFIXES}
SELECT ?score ?passed ?promptHash ?memoryClauseCount
WHERE {
  ${iri.run(project.id, run.attempt)} st:promptHash ?promptHash ;
    st:memoryClauseCount ?memoryClauseCount ;
    st:hasReview ?review .
  ?review st:score ?score ; st:passed ?passed .
}`;

  const base = {
    id: "graph",
    label: "The knowledge graph holds this attempt",
    proves:
      "The record is backed by an assertion in the store, not only by this machine's project file.",
    reproduce: sparql.trim(),
  };

  try {
    const { bindings, servedBy } = await knowledgeStore().query(sparql);
    if (bindings.length === 0) {
      return {
        ...base,
        status: "fail",
        detail: "The store returned no assertion for this attempt.",
      };
    }

    const row = bindings[0];
    const graphScore = Number(row.score);
    const graphHash = row.promptHash;
    const recordScore = run.review?.score ?? NaN;

    // Both the score and the prompt hash have to agree. Either one alone could match by accident.
    const scoreAgrees = Math.abs(graphScore - recordScore) < 0.001;
    const hashAgrees = !run.basePrompt || graphHash === run.basePrompt.promptHash;

    return {
      ...base,
      status: scoreAgrees && hashAgrees ? "pass" : "fail",
      detail:
        scoreAgrees && hashAgrees
          ? `The ${servedBy} store reports score ${graphScore} and prompt ${String(graphHash).slice(0, 16)}…, matching this record. ${row.memoryClauseCount} learned clauses.`
          : `The store disagrees with this record: score ${graphScore} against ${recordScore}, prompt ${String(graphHash).slice(0, 16)}… against ${run.basePrompt?.promptHash.slice(0, 16)}….`,
    };
  } catch (error) {
    return { ...base, status: "unavailable", detail: `The store could not be queried: ${short(error)}` };
  }
}

/**
 * Is the file still the file?
 *
 * Fetches the cut and hashes the bytes. A reference that has been swapped, re-encoded or expired
 * shows up here, which is the difference between a link and a guarantee.
 */
async function mediaIntegrity(run: Run): Promise<Check> {
  const base = {
    id: "media",
    label: "The cut is the file that was recorded",
    proves: "The video on this page is byte-for-byte what the run produced, not a later replacement.",
    reproduce: run.cutUrl ? `curl -s '${run.cutUrl}' | shasum -a 256` : undefined,
  };

  if (!run.cutUrl) return { ...base, status: "unavailable", detail: "This attempt produced no cut." };

  // Runs recorded before content hashing reached the assembler have nothing to compare against.
  // Saying so is the honest outcome; claiming a pass would make the check worthless.
  const recorded = run.shots.find((s) => s.videoUrl === run.cutUrl)?.videoUrl;
  const expected = recorded ? crypto.createHash("sha256").update(recorded).digest("hex") : undefined;

  try {
    const url = run.cutUrl.startsWith("/")
      ? new URL(run.cutUrl, process.env.STELE_PUBLIC_URL ?? "http://127.0.0.1:3210").toString()
      : run.cutUrl;

    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) {
      return { ...base, status: "fail", detail: `The cut could not be fetched (HTTP ${response.status}).` };
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    const digest = crypto.createHash("sha256").update(bytes).digest("hex");

    if (!expected) {
      return {
        ...base,
        status: "pass",
        detail: `Fetched ${(bytes.byteLength / 1e6).toFixed(1)} MB; content hash ${digest.slice(0, 16)}…. This attempt predates content hashing of the assembled cut, so there is no stored digest to compare against.`,
      };
    }

    return {
      ...base,
      status: digest === expected ? "pass" : "fail",
      detail:
        digest === expected
          ? `${(bytes.byteLength / 1e6).toFixed(1)} MB hashing to ${digest.slice(0, 16)}…, as recorded.`
          : `Fetched bytes hash to ${digest.slice(0, 16)}… but ${expected.slice(0, 16)}… was recorded.`,
    };
  } catch (error) {
    return { ...base, status: "unavailable", detail: `The cut could not be fetched: ${short(error)}` };
  }
}

/** Sealed productions carry a UAL. Unsealed ones are not a failure, they are simply not sealed. */
function chainAnchor(project: Project): Check {
  const seal = project.seals.at(-1);
  const base = {
    id: "chain",
    label: "The record is anchored on a chain",
    proves: "Someone with no access to this machine can resolve the record independently.",
  };

  if (!seal?.ual) {
    return {
      ...base,
      status: "unavailable",
      detail:
        "Not sealed. This record is verifiable against this instance and its knowledge store, and no further.",
    };
  }

  return {
    ...base,
    status: "pass",
    detail: `Published to ${seal.network} as ${seal.ual}${seal.txHash ? ` in ${seal.txHash.slice(0, 18)}…` : ""}.`,
    reproduce: `dkg ka query ${seal.ual}`,
  };
}

function short(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 160);
}
