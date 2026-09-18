import { knowledgeStore, resolveDkgMode } from "@/dkg/client";
import { livepeer } from "@/livepeer/mcp-client";
import { CAPABILITY } from "@/livepeer/capabilities";

/**
 * What this instance is actually wired to, checkable without an account or a key.
 *
 * Worth having for the same reason a build stamp is: claims about a stack are cheap, and anyone
 * evaluating this should be able to confirm from the outside whether the knowledge store is a real
 * DKG node or the in-process fallback, and whether the media network is reachable right now. Both
 * checks are live rather than read off configuration.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const store = knowledgeStore();

  // The header polls this on every page load purely to colour one dot, and the full report reaches
  // out to Livepeer to do it. `?probe=store` answers the knowledge-store half on its own so that
  // does not become an outbound request per page view.
  const storeOnly = new URL(request.url).searchParams.get("probe") === "store";

  const [dkg, livepeerStatus] = await Promise.all([
    store.status().catch((error: unknown) => ({
      mode: resolveDkgMode(),
      ready: false,
      detail: `status check failed: ${message(error)}`,
    })),
    storeOnly ? undefined : probeLivepeer(),
  ]);

  if (storeOnly) {
    return Response.json({ knowledge: dkg, trackTwoReady: isDkgNode(dkg) });
  }

  return Response.json({
    service: "stele",
    time: new Date().toISOString(),
    knowledge: dkg,
    livepeer: livepeerStatus,
    capabilities: CAPABILITY,
    // Named so the difference is impossible to miss: `file` is real SPARQL, but it is not the DKG.
    trackTwoReady: isDkgNode(dkg),
  });
}

function isDkgNode(dkg: { mode: string; ready: boolean }): boolean {
  return dkg.ready && (dkg.mode === "edge" || dkg.mode === "network");
}

async function probeLivepeer() {
  const endpoint = process.env.LIVEPEER_MCP_URL ?? "https://agent.livepeer.org/api/mcp";
  const keyed = Boolean(process.env.LIVEPEER_API_KEY);
  try {
    const card = await livepeer().describe(CAPABILITY.reason);
    return {
      endpoint,
      reachable: card.found,
      authenticated: keyed,
      detail: keyed
        ? "Authenticated with an API key."
        : "No API key set. Running on keyless demo credits, which are capped per address.",
      sample: { capability: card.name, priceUSD: card.priceUSD, p50ms: card.sla?.p50_ms },
    };
  } catch (error) {
    return {
      endpoint,
      reachable: false,
      authenticated: keyed,
      detail: message(error),
    };
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
