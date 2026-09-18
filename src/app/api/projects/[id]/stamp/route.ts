import { livepeer } from "@/livepeer/mcp-client";
import { ensureFetchable, stampRecord } from "@/livepeer/capabilities";
import { knowledgeStore } from "@/dkg/client";
import { loadProject, updateProject } from "@/core/store";
import fs from "node:fs/promises";
import path from "node:path";
import { isReadOnly, readOnlyResponse } from "@/core/deploy";

export const dynamic = "force-dynamic";

/**
 * Burn the record's address onto the finished cut.
 *
 * On demand rather than automatic. Not every cut is one you want stamped, and a production still in
 * progress has nothing worth pointing at. The stamped file is kept alongside the original, never
 * over it: the unstamped cut is what the record's integrity check hashes.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (isReadOnly()) return readOnlyResponse();

  const { id } = await params;

  const project = await loadProject(id);
  if (!project) return Response.json({ error: "No such project." }, { status: 404 });

  const run = project.runs.filter((r) => r.stage === "COMPLETE" && r.cutUrl).at(-1);
  if (!run?.cutUrl) {
    return Response.json({ error: "There is no finished cut to stamp." }, { status: 400 });
  }

  const origin = process.env.STELE_PUBLIC_URL ?? new URL(request.url).origin;
  const recordUrl = `${origin.replace(/^https?:\/\//, "")}/record/${project.id}`;
  const seal = project.seals.at(-1);

  try {
    // Seeded productions serve their media from the repo, which the network cannot reach. Upload it
    // first so the demo bundle behaves like a production this instance rendered.
    const fetchable = await ensureFetchable(
      livepeer(),
      `stamp:attempt-${run.attempt}`,
      run.cutUrl,
      (local) => fs.readFile(path.join(process.cwd(), "public", local.replace(/^\//, "")))
    );

    const stamped = await stampRecord(
      livepeer(),
      `stamp:attempt-${run.attempt}`,
      fetchable,
      project.title,
      // A sealed production points at its UAL, which resolves without this machine being reachable.
      seal?.ual ? `verify · ${seal.ual}` : `verify at ${recordUrl}`
    );

    const updated = await updateProject(id, (current) => ({
      ...current,
      runs: current.runs.map((r) => (r.attempt === run.attempt ? { ...r, stampedUrl: stamped.url } : r)),
    }));
    await knowledgeStore().write(updated).catch(() => undefined);

    return Response.json({ stampedUrl: stamped.url, costUSD: stamped.costUSD, attempt: run.attempt });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }
}
