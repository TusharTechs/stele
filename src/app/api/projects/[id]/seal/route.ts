import { knowledgeStore, resolveDkgMode } from "@/dkg/client";
import { loadProject, updateProject } from "@/core/store";

export const dynamic = "force-dynamic";

/**
 * Seal a production: publish its Run Ledger to Verifiable Memory and keep the UAL.
 *
 * Up to this point the record lives in Working and Shared Working Memory — real, queryable, and
 * gossiped to peers, but ultimately still ours. Sealing anchors it on chain, which is what makes the
 * production record checkable by someone who does not trust us and has no access to this machine.
 *
 * Deliberately a separate, explicit action rather than something a run does on its own: it costs gas
 * and it is not reversible. You seal a cut you are willing to stand behind.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const project = await loadProject(id);
  if (!project) return Response.json({ error: "No such project." }, { status: 404 });

  const completed = project.runs.filter((run) => run.stage === "COMPLETE" && run.review);
  if (completed.length === 0) {
    return Response.json({ error: "There is no finished attempt to seal." }, { status: 400 });
  }

  const mode = resolveDkgMode();
  if (mode !== "network") {
    return Response.json(
      {
        error:
          mode === "edge"
            ? "This instance runs on Working and Shared Working Memory. Set STELE_DKG=network to publish to a chain and mint a UAL."
            : "This instance has no DKG node. Set STELE_DKG=network and run 'dkg init && dkg start' to seal a production.",
        mode,
      },
      { status: 409 }
    );
  }

  const store = knowledgeStore();
  const attempt = completed.at(-1)!.attempt;

  try {
    // Write before publishing: publishing anchors whatever the node currently holds, so a stale
    // assertion would be sealed permanently with the newest attempt missing from it.
    await store.write(project);
    const result = await store.publish(project);

    const updated = await updateProject(id, (current) => ({
      ...current,
      seals: [
        ...current.seals,
        {
          ual: result.ual,
          txHash: result.txHash,
          network: process.env.DKG_NETWORK ?? "testnet",
          contextGraph: process.env.DKG_CONTEXT_GRAPH_NAME ?? "stele-studio",
          assetNames: [],
          sealedAt: Date.now(),
          attempt,
          mode,
        },
      ],
    }));

    return Response.json({ seal: updated.seals.at(-1), raw: result.raw, project: updated });
  } catch (error) {
    return Response.json({ error: message(error) }, { status: 502 });
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
