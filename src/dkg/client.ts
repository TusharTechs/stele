import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { Project } from "@/core/schemas";
import { buildCanon, buildRunLedger } from "./serialize";
import type { Binding } from "./queries";

const execFileAsync = promisify(execFile);

/**
 * Where knowledge is kept.
 *
 * Three stores behind one interface, and the difference between them is real rather than cosmetic:
 *
 *   `network` — a DKG node that publishes to Verifiable Memory. Assets are anchored on chain and
 *               carry a UAL. This is the path the hackathon prefers, and the only one that produces
 *               third-party-checkable evidence.
 *   `edge`    — the same node, writing to Working and Shared Working Memory. Real DKG, real gossip
 *               between peers, no chain transaction and no UAL.
 *   `file`    — an in-process RDF store. It runs the *same SPARQL* as the other two, so the
 *               semantics are genuine and the app is explorable with nothing installed. It is not,
 *               and is never presented as, evidence of a DKG integration.
 *
 * Every store writes the same two Turtle assets from `serialize.ts`, so switching modes changes
 * where knowledge lives, never what it says.
 */

export type DkgMode = "network" | "edge" | "file";

export interface StoreStatus {
  mode: DkgMode;
  ready: boolean;
  /** One line, safe to show a user, explaining what is and isn't working. */
  detail: string;
  contextGraph?: string;
  network?: string;
  cliVersion?: string;
}

export interface WriteResult {
  assetNames: string[];
  references: string[];
  /** Which store actually answered — surfaced in the UI so a fallback is never mistaken for the real path. */
  servedBy: DkgMode;
}

export interface PublishResult {
  ual?: string;
  txHash?: string;
  raw: string;
}

export interface QueryResult {
  bindings: Binding[];
  servedBy: DkgMode;
  ms: number;
}

export interface KnowledgeStore {
  readonly mode: DkgMode;
  status(): Promise<StoreStatus>;
  write(project: Project): Promise<WriteResult>;
  query(sparql: string): Promise<QueryResult>;
  /** Anchors the current snapshot on chain. Only the `network` store can do this. */
  publish(project: Project): Promise<PublishResult>;
}

const DATA_DIR = process.env.STELE_DATA_DIR ?? path.join(process.cwd(), ".data");
const GRAPH_DIR = path.join(DATA_DIR, "graph");

// ---------------------------------------------------------------- file store

/**
 * An RDF store held in the process, backed by Turtle files on disk.
 *
 * Deliberately not a stub. It parses the same Turtle, executes the same SPARQL through oxigraph, and
 * answers cross-project queries the same way — so a lesson written by one project really is
 * discovered by another through a graph query rather than a lookup. What it does not have is a peer
 * network, ownership, or an integrity proof, which is exactly the part that matters and exactly why
 * it is labelled everywhere it appears.
 */
export class FileKnowledgeStore implements KnowledgeStore {
  readonly mode = "file" as const;

  async status(): Promise<StoreStatus> {
    const files = await this.turtleFiles();
    return {
      mode: "file",
      ready: true,
      detail:
        files.length === 0
          ? "In-process RDF store, empty. Real SPARQL, no DKG node — not evidence of a DKG integration."
          : `In-process RDF store holding ${files.length} assertion file(s). Real SPARQL, no DKG node.`,
    };
  }

  async write(project: Project): Promise<WriteResult> {
    const dir = path.join(GRAPH_DIR, project.id);
    await fs.mkdir(dir, { recursive: true });

    const canon = buildCanon(project);
    const ledger = buildRunLedger(project);
    await fs.writeFile(path.join(dir, "canon.ttl"), canon, "utf8");
    await fs.writeFile(path.join(dir, "run-ledger.ttl"), ledger, "utf8");

    // Immutable per-attempt snapshots, so the before/after view compares two real historical
    // assertions rather than re-deriving what an earlier attempt would look like today.
    const version = Math.max(1, project.runs.length);
    const snapshotDir = path.join(dir, "snapshots", `try-${version}`);
    await fs.mkdir(snapshotDir, { recursive: true });
    await fs.writeFile(path.join(snapshotDir, "canon.ttl"), canon, "utf8");
    await fs.writeFile(path.join(snapshotDir, "run-ledger.ttl"), ledger, "utf8");

    return {
      assetNames: [`${project.id}/canon`, `${project.id}/run-ledger`],
      references: [path.join(dir, "canon.ttl"), path.join(dir, "run-ledger.ttl")],
      servedBy: "file",
    };
  }

  async query(sparql: string): Promise<QueryResult> {
    const started = Date.now();
    const store = await this.load();
    const rows = store.query(sparql, { use_default_graph_as_union: true });
    return { bindings: toBindings(rows), servedBy: "file", ms: Date.now() - started };
  }

  async publish(): Promise<PublishResult> {
    throw new Error(
      "The file store cannot publish to a network. Set STELE_DKG=network and run a DKG node to seal a production."
    );
  }

  /**
   * Rebuild the store from disk on every query.
   *
   * These graphs are a few thousand triples, so parsing them costs less than a millisecond and
   * removes a whole class of staleness bug: a run that just wrote an assertion would otherwise
   * query a store that predates it. Correctness first; this is not the hot path.
   */
  private async load() {
    const oxigraph = await import("oxigraph");
    const store = new oxigraph.Store();
    for (const file of await this.turtleFiles()) {
      const turtle = await fs.readFile(file, "utf8");
      // One named graph per asset file, so a rebuild can never merge two projects' assertions and
      // `use_default_graph_as_union` still lets a cross-project query see all of them at once.
      const rel = path.relative(GRAPH_DIR, file).split(path.sep).join("/");
      try {
        store.load(turtle, {
          format: "text/turtle",
          to_graph_name: oxigraph.namedNode(`https://stele.studio/graph/${rel}`),
        });
      } catch (error) {
        throw new Error(`Could not parse ${path.basename(file)} as Turtle: ${String(error).slice(0, 200)}`);
      }
    }
    return store;
  }

  /** Current assets only — snapshots are history and would double every row if queried alongside. */
  private async turtleFiles(): Promise<string[]> {
    const out: string[] = [];
    let projects: string[];
    try {
      projects = await fs.readdir(GRAPH_DIR);
    } catch {
      return out;
    }
    for (const projectId of projects) {
      for (const name of ["canon.ttl", "run-ledger.ttl"]) {
        const file = path.join(GRAPH_DIR, projectId, name);
        try {
          await fs.access(file);
          out.push(file);
        } catch {
          // Not every project has written both assets yet.
        }
      }
    }
    return out;
  }
}

// ---------------------------------------------------------------- DKG node store

/**
 * A real DKG node — writes through its CLI, reads through its local HTTP API.
 *
 * The split is deliberate, and it was arrived at by trying the obvious thing first.
 *
 * **Writes go through the CLI** because `dkg ka create … --share` is the surface OriginTrail
 * documents for the Knowledge Asset lifecycle. Every write this store performs can be reproduced by
 * hand from a terminal, which is what makes the provenance claim checkable by someone who does not
 * trust this code.
 *
 * **Reads go through `POST /api/query`** because `dkg query` renders its result as a formatted
 * table for humans, with values truncated to fit the column width. Parsing that would be a silent
 * data-loss bug of the worst kind: the compiler would receive zero rows — or worse, truncated ones —
 * and every prompt would quietly fall back to the brief while still reporting success. The daemon's
 * HTTP API answers the identical SPARQL as JSON bindings.
 *
 * Writes are cumulative and version-scoped: attempt *n* creates a new named asset rather than
 * mutating attempt *n-1*'s. Shared Working Memory does not let you take an assertion back once peers
 * hold it, and rewriting history is the wrong behaviour for a provenance record anyway.
 */
export class DkgNodeStore implements KnowledgeStore {
  private resolvedGraph?: string;
  private cachedToken?: string;
  private mirror = new FileKnowledgeStore();

  constructor(
    readonly mode: "edge" | "network",
    private readonly bin = process.env.DKG_CLI_BIN ?? "dkg",
    private readonly graphName = process.env.DKG_CONTEXT_GRAPH_NAME ?? "stele-studio",
    private readonly graphId = process.env.DKG_CONTEXT_GRAPH_ID ?? "",
    private readonly apiUrl = process.env.DKG_API_URL ?? "http://127.0.0.1:9200"
  ) {}

  async status(): Promise<StoreStatus> {
    try {
      const version = (await this.run(["--version"])).trim().split(/\s+/).pop();
      // `--version` only proves the CLI is installed. The daemon has to actually be up, or every
      // read silently degrades to the mirror and the badge would still claim a DKG integration.
      const graph = await this.contextGraph();
      await this.query("ASK { ?s ?p ?o }");
      return {
        mode: this.mode,
        ready: true,
        detail:
          this.mode === "network"
            ? `DKG node ready. Assets share to peers and seal to Verifiable Memory on ${this.network()}.`
            : "DKG node ready. Assets write to Working Memory and share to peers. No chain publish.",
        contextGraph: graph,
        network: this.network(),
        cliVersion: version,
      };
    } catch (error) {
      return {
        mode: this.mode,
        ready: false,
        detail: `DKG node unavailable: ${message(error)}. Install with 'npm i -g @origintrail-official/dkg', then 'dkg init' and 'dkg start'.`,
        network: this.network(),
      };
    }
  }

  async write(project: Project): Promise<WriteResult> {
    // The mirror always gets the assertion, so the graph views keep working if the node is down.
    await this.mirror.write(project);

    const graph = await this.contextGraph();
    const version = Math.max(1, project.runs.length);
    const canonFile = await this.stage(project.id, `canon-try-${version}.ttl`, buildCanon(project));
    const ledgerFile = await this.stage(project.id, `ledger-try-${version}.ttl`, buildRunLedger(project));

    const canonName = assetName(project.id, "canon", version);
    const ledgerName = assetName(project.id, "run-ledger", version);

    await this.share(canonName, graph, canonFile);
    await this.share(ledgerName, graph, ledgerFile);

    return {
      assetNames: [canonName, ledgerName],
      references: [`dkg:${graph}/${canonName}`, `dkg:${graph}/${ledgerName}`],
      servedBy: this.mode,
    };
  }

  /**
   * Ask the node, over its local HTTP API.
   *
   * `includeSharedMemory` is what makes a lesson another agent shared visible here: without it the
   * query sees only this node's own Working Memory and cross-project inheritance silently returns
   * nothing.
   */
  async query(sparql: string): Promise<QueryResult> {
    const started = Date.now();
    try {
      const [graph, token] = await Promise.all([this.contextGraph(), this.authToken()]);

      const response = await fetch(`${this.apiUrl}/api/query`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ sparql, contextGraphId: graph, includeSharedMemory: true }),
        signal: AbortSignal.timeout(30_000),
      });

      const payload = (await response.json()) as {
        result?: { bindings?: Array<Record<string, unknown>> };
        error?: string;
      };
      if (!response.ok || payload.error) {
        throw new Error(payload.error ?? `node returned HTTP ${response.status}`);
      }

      const bindings = (payload.result?.bindings ?? []).map((row) => {
        const out: Binding = {};
        for (const [key, value] of Object.entries(row)) out[key] = termValue(value);
        return out;
      });
      return { bindings, servedBy: this.mode, ms: Date.now() - started };
    } catch (error) {
      // A read failure must not take the studio down mid-run. Fall back to the mirror and say so —
      // the caller renders `servedBy`, so a degraded read is visible rather than silently accepted.
      console.warn(`[dkg] query fell back to the local mirror: ${message(error)}`);
      const fallback = await this.mirror.query(sparql);
      return { ...fallback, servedBy: "file" };
    }
  }

  async publish(project: Project): Promise<PublishResult> {
    if (this.mode !== "network") {
      throw new Error("Sealing to Verifiable Memory requires STELE_DKG=network.");
    }
    const graph = await this.contextGraph();
    const version = Math.max(1, project.runs.length);
    const ledgerName = assetName(project.id, "run-ledger", version);

    const out = await this.run(["ka", "publish", ledgerName, "-c", graph]);
    return { ual: parseUal(out), txHash: parseTxHash(out), raw: redactCli(out).slice(0, 2000) };
  }

  // ---------------------------------------------------------------- CLI plumbing

  private network(): string {
    return process.env.DKG_NETWORK ?? "testnet";
  }

  /**
   * The node's API bearer token.
   *
   * Read from the token file rather than `dkg auth show`, which costs a process spawn on every
   * query. The file leads with a comment line warning that the token is a password, so the first
   * line that is neither blank nor a comment is the token itself.
   */
  private async authToken(): Promise<string> {
    if (this.cachedToken) return this.cachedToken;
    if (process.env.DKG_API_TOKEN) {
      this.cachedToken = process.env.DKG_API_TOKEN;
      return this.cachedToken;
    }

    const file = path.join(process.env.DKG_HOME ?? path.join(os.homedir(), ".dkg"), "auth.token");
    const token = (await fs.readFile(file, "utf8"))
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0 && !line.startsWith("#"));

    if (!token) throw new Error(`no API token found in ${file}`);
    this.cachedToken = token;
    return token;
  }

  private async contextGraph(): Promise<string> {
    if (this.resolvedGraph) return this.resolvedGraph;
    if (this.graphId) {
      this.resolvedGraph = this.graphId;
      return this.graphId;
    }

    const list = await this.run(["context-graph", "list"]);
    const existing = list
      .split(/\r?\n/)
      .map((line) => line.trim().split(/\s+/)[0])
      .find((id) => id === this.graphName || id.endsWith(`/${this.graphName}`));
    if (existing) {
      this.resolvedGraph = existing;
      return existing;
    }

    const created = await this.run(["context-graph", "create", this.graphName]);
    const id = created.match(/ID:\s+(\S+)/)?.[1] ?? this.graphName;
    this.resolvedGraph = id;
    return id;
  }

  /**
   * Create-and-share an asset, tolerating the states a half-finished previous attempt leaves behind.
   *
   * Sharing is a multi-step promotion (write, finalize, share) and a run interrupted between steps
   * leaves an asset that exists but is not shared. Re-running the same version must converge rather
   * than fail, so each state is handled explicitly and transient promotion errors get a bounded retry.
   */
  private async share(name: string, graph: string, inputFile: string): Promise<void> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const status = await this.assetStatus(name, graph);
        if (!status) {
          await this.run(["ka", "create", name, "-c", graph, "--input-file", inputFile, "--share"]);
        } else if (!isShared(status)) {
          if (!isFinalized(status)) {
            await this.run(["ka", "write", name, "-c", graph, "--input-file", inputFile]);
            await this.run(["ka", "finalize", name, "-c", graph]);
          }
          await this.run(["ka", "share", name, "-c", graph]);
        }

        const confirmed = await this.assetStatus(name, graph);
        if (confirmed && isShared(confirmed)) return;
        throw new Error("share is still pending");
      } catch (error) {
        if (attempt === 3 || !isTransient(error)) throw error;
        await sleep(attempt * 1500);
      }
    }
  }

  private async assetStatus(name: string, graph: string): Promise<Record<string, unknown> | null> {
    try {
      return JSON.parse(await this.run(["ka", "status", name, "-c", graph])) as Record<string, unknown>;
    } catch (error) {
      if (/no knowledge asset/i.test(message(error))) return null;
      throw error;
    }
  }

  private async stage(projectId: string, filename: string, turtle: string): Promise<string> {
    const dir = path.join(DATA_DIR, "dkg-input", projectId);
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, filename);
    await fs.writeFile(file, turtle, "utf8");
    return file;
  }

  private async run(args: string[]): Promise<string> {
    try {
      const { stdout } = await execFileAsync(this.bin, args, {
        timeout: 120_000,
        maxBuffer: 8 * 1024 * 1024,
        env: process.env,
      });
      return stdout;
    } catch (error) {
      throw new Error(redactCli(message(error)).slice(0, 800));
    }
  }
}

// ---------------------------------------------------------------- helpers

function assetName(projectId: string, kind: string, version: number): string {
  return `stele-${projectId}-${kind}-try-${version}`.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 110);
}

function isShared(status: Record<string, unknown>): boolean {
  return status.memoryLayer === "SWM" || status.state === "promoted" || status.status === "swm-shared";
}

function isFinalized(status: Record<string, unknown>): boolean {
  return status.state === "finalized" || status.status === "wm-finalized";
}

function isTransient(error: unknown): boolean {
  return /already exists|already finalized|promote|promotion|fan-out|watchdog|timeout|still pending|share operation/i.test(
    message(error)
  );
}

function termValue(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") return stripLiteral(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object" && "value" in value) return termValue((value as { value: unknown }).value);
  return undefined;
}

/** Turtle-style literals arrive quoted and sometimes typed; callers want the value. */
function stripLiteral(value: string): string {
  const match = value.match(/^"((?:[^"\\]|\\.)*)"(?:\^\^\S+|@\S+)?$/);
  if (!match) return value;
  try {
    return JSON.parse(`"${match[1]}"`) as string;
  } catch {
    return match[1];
  }
}

/** oxigraph returns `Map<string, Term>` rows; flatten them to the same shape as the CLI path. */
function toBindings(rows: unknown): Binding[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    const out: Binding = {};
    if (row instanceof Map) {
      for (const [key, term] of row.entries()) {
        out[key] = (term as { value?: string })?.value;
      }
    }
    return out;
  });
}

export function parseUal(output: string): string | undefined {
  return output.match(/\b(did:dkg:[^\s"']+)/i)?.[1] ?? output.match(/UAL[:\s]+(\S+)/i)?.[1];
}

function parseTxHash(output: string): string | undefined {
  return output.match(/\b(0x[a-fA-F0-9]{64})\b/)?.[1];
}

/** CLI output reaches logs and the UI; wallet material and tokens must not ride along. */
function redactCli(value: string): string {
  return String(value)
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/\b(private[_\s-]?key|mnemonic|seed[_\s-]?phrase|secret)\b[^\n]*/gi, "$1 [redacted]")
    .replace(/\b0x[a-fA-F0-9]{64,}\b/g, (match) => (match.length > 66 ? "0x[redacted]" : match));
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------- selection

let singleton: KnowledgeStore | undefined;

export function resolveDkgMode(): DkgMode {
  const mode = (process.env.STELE_DKG ?? "file").toLowerCase();
  return mode === "network" || mode === "edge" ? mode : "file";
}

export function knowledgeStore(): KnowledgeStore {
  if (!singleton) {
    const mode = resolveDkgMode();
    singleton = mode === "file" ? new FileKnowledgeStore() : new DkgNodeStore(mode);
  }
  return singleton;
}
