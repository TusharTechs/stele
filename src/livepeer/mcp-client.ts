import crypto from "node:crypto";

/**
 * Client for the Livepeer Agent raw MCP surface.
 *
 * Livepeer Agent speaks MCP over plain HTTP JSON-RPC, so this is a fetch loop rather than a
 * framework client: one POST per call, with the server-issued `mcp-session-id` threaded back on
 * every subsequent request. That keeps the whole integration inspectable — there is no transport
 * layer between a capability name and the wire.
 *
 * The surface's own contract is that a capability name is exactly what runs: it never fuzzy-matches
 * and never substitutes a sibling model. This client preserves that property rather than papering
 * over it — a failed capability surfaces as a failure, not as a quiet fallback to something that
 * happened to work.
 */

/** One call to the network, recorded whether it succeeded or not. This is the unit of the ledger. */
export interface LivepeerCall {
  id: string;
  capability: string;
  stage: string;
  argsHash: string;
  at: number;
  latencyMs: number;
  ok: boolean;
  costUSD: number;
  costUnitKind?: string;
  costUnits?: number;
  jobId?: string;
  outputUrl?: string;
  /** The network tells us when it ignored a parameter we sent. We keep those rather than drop them. */
  warnings: CapabilityWarning[];
  error?: string;
}

export interface CapabilityWarning {
  kind: string;
  message: string;
}

export interface RunResult {
  ok: boolean;
  capability: string;
  outputKind?: string;
  /** Public https URL of the produced media, when the capability produces media. */
  url?: string;
  /** Text output, for reasoning and analysis capabilities. */
  text?: string;
  modelId?: string;
  costUSD: number;
  warnings: CapabilityWarning[];
  error?: string;
  call: LivepeerCall;
}

export interface RunRequest {
  capability: string;
  /** Free-label for the ledger: which pipeline stage asked for this. */
  stage: string;
  prompt?: string;
  sourceUrl?: string;
  inputs?: Record<string, unknown>;
  /** Seconds. Passed to the network and used as our own polling deadline. */
  timeout?: number;
  /** Dispatch without blocking and poll `get_create_media`. Required for video. */
  async?: boolean;
  /**
   * Re-host the output to durable storage and return a permanent URL.
   *
   * Worth the extra step for anything that ends up in a production record: a provider URL carries
   * the provider's own expiry, so a reference written into a Knowledge Asset today becomes a 404
   * on a delay fuse. Intermediate artifacts that are consumed within the same run don't need it.
   */
  persist?: boolean;
  sessionLabel?: string;
  idempotencyKey?: string;
}

export class LivepeerError extends Error {
  constructor(
    message: string,
    readonly capability: string,
    readonly call: LivepeerCall
  ) {
    super(message);
    this.name = "LivepeerError";
  }
}

type JsonRpcPayload = Record<string, unknown>;

/** What one dispatch produced, before it is split into a ledger entry and a caller-facing result. */
interface CallOutcome {
  ok: boolean;
  jobId?: string;
  outputKind?: string;
  url?: string;
  text?: string;
  modelId?: string;
  costUSD?: number;
  costUnitKind?: string;
  costUnits?: number;
  warnings?: CapabilityWarning[];
  error?: string;
}

const POLL_INTERVAL_MS = 5000;

export class LivepeerAgent {
  private sessionId?: string;
  private initializing?: Promise<void>;
  private describeCache = new Map<string, CapabilityCard>();
  private calls: LivepeerCall[] = [];

  constructor(
    private readonly endpoint: string,
    private readonly apiKey?: string,
    private readonly onCall?: (call: LivepeerCall) => void
  ) {}

  /** Every call this client has made, in order. The cost ledger is derived from this. */
  ledger(): LivepeerCall[] {
    return [...this.calls];
  }

  totalCostUSD(): number {
    return this.calls.reduce((sum, c) => sum + c.costUSD, 0);
  }

  // ---------------------------------------------------------------- capability metadata

  /**
   * The capability's own parameter contract, price and measured latency, straight from the network.
   *
   * Cached per process: these cards are stable within a session and we read them before most
   * dispatches, so re-fetching each time would add a round trip to every stage for no new
   * information.
   */
  async describe(capability: string): Promise<CapabilityCard> {
    const cached = this.describeCache.get(capability);
    if (cached) return cached;

    const payload = await this.callTool("describe_capability", { name: capability });
    const sc = structured(payload);
    const card: CapabilityCard = {
      name: capability,
      found: Boolean(sc.found),
      kind: str(sc.kind),
      outputKind: str(sc.output_kind),
      unitKind: str(sc.unit_kind),
      priceUSD: num(sc.display_price_usd),
      constraints: (sc.constraints ?? {}) as Record<string, unknown>,
      exampleInputs: (sc.example_inputs ?? {}) as Record<string, unknown>,
      sla: (sc.sla ?? null) as CapabilityCard["sla"],
    };
    this.describeCache.set(capability, card);
    return card;
  }

  async listCapabilities(kind?: "ai" | "tool" | "mcp"): Promise<Array<Record<string, unknown>>> {
    const payload = await this.callTool("list_capabilities", kind ? { kind } : {});
    const sc = structured(payload);
    return Array.isArray(sc.capabilities) ? (sc.capabilities as Array<Record<string, unknown>>) : [];
  }

  // ---------------------------------------------------------------- dispatch

  /**
   * Run one capability and return its output.
   *
   * Synchronous capabilities return their result inline. Asynchronous ones (video, mainly) return a
   * job id immediately and are polled to completion here, so callers see one awaitable either way.
   */
  async run(req: RunRequest): Promise<RunResult> {
    const startedAt = Date.now();
    const args: Record<string, unknown> = {
      capability: req.capability,
      ...(req.prompt ? { prompt: req.prompt } : {}),
      ...(req.sourceUrl ? { source_url: req.sourceUrl } : {}),
      ...(req.inputs && Object.keys(req.inputs).length ? { inputs: req.inputs } : {}),
      timeout: req.timeout ?? 60,
      ...(req.async ? { async: true } : {}),
      persist: req.persist ?? false,
      ...(req.sessionLabel ? { session_id: `stele_${safeId(req.sessionLabel)}` } : {}),
      ...(req.idempotencyKey ? { idempotency_key: req.idempotencyKey } : {}),
    };
    const argsHash = hash(JSON.stringify(args));

    let payload: JsonRpcPayload;
    try {
      payload = await this.callTool("run_capability", args);
    } catch (error) {
      return this.record(req, argsHash, startedAt, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    let sc = structured(payload);

    // A dispatched async job returns an id; poll it rather than making every caller do so.
    const jobId = str(sc.job_id) ?? str(sc.jobId);
    if (req.async && jobId && !sc.url) {
      try {
        sc = await this.pollJob(jobId, pollDeadlineFor(req.timeout ?? 300));
      } catch (error) {
        return this.record(req, argsHash, startedAt, {
          ok: false,
          jobId,
          error: error instanceof Error ? error.message : String(error),
          // The dispatch itself was billed even though the job did not finish.
          costUSD: num(sc.cost_usd_estimated) ?? 0,
        });
      }
    }

    const failed = sc.ok === false || Boolean(toolError(payload));
    return this.record(req, argsHash, startedAt, {
      ok: !failed,
      jobId,
      outputKind: str(sc.output_kind),
      url: str(sc.url),
      text: extractText(sc, payload),
      modelId: str((sc.result as Record<string, unknown> | undefined)?.model_id),
      costUSD: num(sc.cost_usd_estimated) ?? 0,
      costUnitKind: str(sc.cost_unit_kind),
      costUnits: num(sc.cost_units),
      warnings: warningsOf(sc),
      error: failed ? (str(sc.error) ?? toolError(payload) ?? "capability failed") : undefined,
    });
  }

  /** Like `run`, but a failure throws instead of returning `ok: false`. For stages that cannot proceed. */
  async runOrThrow(req: RunRequest): Promise<RunResult> {
    const result = await this.run(req);
    if (!result.ok) {
      throw new LivepeerError(
        `${req.capability} failed during ${req.stage}: ${result.error ?? "unknown error"}`,
        req.capability,
        result.call
      );
    }
    return result;
  }

  /**
   * Wait for an async job, and wait longer than the provider will.
   *
   * The dispatch timeout is what the network is told to allow the render. Polling only that long
   * means giving up at the exact moment the job resolves, and the surface is explicit about the
   * consequence: "a shorter one aborts a render the provider finishes and bills". Measured on a
   * loaded network, two shots timed out at 308s against a 300s ceiling and cost $0.57 each for a
   * result nobody collected, then re-rendered and paid again.
   *
   * Polling past the provider's own abort costs nothing when the job is quick, and collects either
   * the output or the provider's own error when it is slow.
   */
  private async pollJob(jobId: string, timeoutSeconds: number): Promise<Record<string, unknown>> {
    const deadline = Date.now() + timeoutSeconds * 1000;
    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);
      const payload = await this.callTool("get_create_media", { job_id: jobId });
      const sc = structured(payload);
      const status = String(sc.status ?? "").toLowerCase();

      if (["failed", "error", "cancelled"].includes(status)) {
        throw new Error(`job ${jobId} ended as "${status}": ${str(sc.error) ?? "no detail given"}`);
      }
      if (sc.url) return sc;
    }
    throw new Error(`job ${jobId} did not finish within ${timeoutSeconds}s`);
  }

  private record(req: RunRequest, argsHash: string, startedAt: number, outcome: CallOutcome): RunResult {
    const call: LivepeerCall = {
      id: crypto.randomUUID(),
      capability: req.capability,
      stage: req.stage,
      argsHash,
      at: startedAt,
      latencyMs: Date.now() - startedAt,
      ok: outcome.ok,
      costUSD: outcome.costUSD ?? 0,
      costUnitKind: outcome.costUnitKind,
      costUnits: outcome.costUnits,
      jobId: outcome.jobId,
      outputUrl: outcome.url,
      warnings: outcome.warnings ?? [],
      error: outcome.error,
    };
    this.calls.push(call);
    this.onCall?.(call);

    return {
      ok: outcome.ok,
      capability: req.capability,
      outputKind: outcome.outputKind,
      url: outcome.url,
      text: outcome.text,
      modelId: outcome.modelId,
      costUSD: call.costUSD,
      warnings: call.warnings,
      error: outcome.error,
      call,
    };
  }

  // ---------------------------------------------------------------- transport

  private async callTool(name: string, args: Record<string, unknown>): Promise<JsonRpcPayload> {
    await this.ensureInitialized();
    return this.rpc("tools/call", { name, arguments: args });
  }

  private ensureInitialized(): Promise<void> {
    // Guard the promise, not a boolean: concurrent stages would otherwise each open a session,
    // and only the last one's id would survive on `this.sessionId`.
    this.initializing ??= this.rpc("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "stele", version: "0.1.0" },
    }).then((payload) => {
      if (payload.error) {
        this.initializing = undefined;
        throw new Error(`Livepeer Agent rejected the session: ${JSON.stringify(payload.error)}`);
      }
    });
    return this.initializing;
  }

  private async rpc(method: string, params: Record<string, unknown>): Promise<JsonRpcPayload> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        // Documented on the Get Started page as "X-Livepeer Agent-Tool-Profile". That spelling
        // contains a space, which is not a legal HTTP field name, so any spec-compliant client
        // throws before the request leaves. The hyphenated form is what the server accepts.
        "x-livepeer-agent-tool-profile": "lean",
        ...(this.sessionId ? { "mcp-session-id": this.sessionId } : {}),
        ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method, params }),
    });

    this.sessionId = response.headers.get("mcp-session-id") ?? this.sessionId;
    const body = await response.text();
    if (!response.ok) {
      throw new Error(`Livepeer Agent returned HTTP ${response.status}: ${redact(body).slice(0, 400)}`);
    }
    return parseBody(body);
  }
}

export interface CapabilityCard {
  name: string;
  found: boolean;
  kind?: string;
  outputKind?: string;
  unitKind?: string;
  priceUSD?: number;
  constraints: Record<string, unknown>;
  exampleInputs: Record<string, unknown>;
  sla: { p50_ms?: number; p95_ms?: number; success_rate?: number; note?: string } | null;
}

// -------------------------------------------------------------------- payload helpers

/**
 * The endpoint may answer as JSON or as an SSE stream depending on the call; both carry the same
 * JSON-RPC envelope, so normalise here and let everything above deal in objects.
 */
function parseBody(body: string): JsonRpcPayload {
  const trimmed = body.trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed) as JsonRpcPayload;

  const frames = trimmed
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter((line) => line && line !== "[DONE]");

  for (const frame of frames.reverse()) {
    try {
      const parsed = JSON.parse(frame) as JsonRpcPayload;
      if (parsed.result || parsed.error) return parsed;
    } catch {
      // Not every frame is a complete envelope; keep looking.
    }
  }
  throw new Error("Livepeer Agent returned a response this client could not parse.");
}

function structured(payload: JsonRpcPayload): Record<string, unknown> {
  const result = payload.result as Record<string, unknown> | undefined;
  return (result?.structuredContent as Record<string, unknown> | undefined) ?? {};
}

function toolError(payload: JsonRpcPayload): string | undefined {
  if (payload.error) return JSON.stringify(payload.error).slice(0, 400);
  const result = payload.result as { isError?: boolean } | undefined;
  if (result?.isError) return collectText(payload).slice(0, 400) || "tool reported an error";
  return undefined;
}

function extractText(sc: Record<string, unknown>, payload: JsonRpcPayload): string | undefined {
  const inner = sc.result as Record<string, unknown> | undefined;
  const text = str(inner?.text);
  if (text) return text;
  const collected = collectText(payload);
  return collected || undefined;
}

function collectText(payload: JsonRpcPayload): string {
  const content = (payload.result as { content?: Array<{ text?: string }> } | undefined)?.content;
  if (!Array.isArray(content)) return "";
  return content
    .map((item) => item.text)
    .filter(Boolean)
    .join("\n");
}

function warningsOf(sc: Record<string, unknown>): CapabilityWarning[] {
  if (!Array.isArray(sc.warnings)) return [];
  return (sc.warnings as Array<Record<string, unknown>>).map((w) => ({
    kind: String(w.kind ?? "warning"),
    message: String(w.message ?? ""),
  }));
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function hash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function safeId(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 60) || "run";
}

/** Error bodies travel into logs and the UI; never let a bearer token ride along. */
function redact(value: string): string {
  return value.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The provider's ceiling plus a margin, so the last poll lands after the job has resolved either way. */
export function pollDeadlineFor(dispatchTimeoutSeconds: number): number {
  return Math.ceil(dispatchTimeoutSeconds * 1.25) + 45;
}

let singleton: LivepeerAgent | undefined;

export function livepeer(): LivepeerAgent {
  singleton ??= new LivepeerAgent(
    process.env.LIVEPEER_MCP_URL ?? "https://agent.livepeer.org/api/mcp",
    process.env.LIVEPEER_API_KEY
  );
  return singleton;
}
