import { z } from "zod";
import { loadProject } from "@/core/store";
import { AlreadyRunning, isRunning, startRun } from "@/core/runner";
import { isReadOnly, readOnlyResponse } from "@/core/deploy";

export const dynamic = "force-dynamic";

const StartSchema = z.object({
  /** Compile from the brief alone — the control half of a paired comparison. */
  withholdMemory: z.boolean().default(false),
  pairedWithAttempt: z.number().int().positive().optional(),
});

/**
 * Starts a production and returns immediately.
 *
 * The run is detached on purpose: the client watches it through `/events`, so the HTTP request that
 * started it is not what keeps it alive. Nothing here waits for a render.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (isReadOnly()) return readOnlyResponse();

  const { id } = await params;

  const project = await loadProject(id);
  if (!project) return Response.json({ error: "No such project." }, { status: 404 });

  const parsed = StartSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid options." }, { status: 400 });
  }

  try {
    startRun({ projectId: id, ...parsed.data });
    return Response.json({ started: true, attempt: project.runs.length + 1 }, { status: 202 });
  } catch (error) {
    if (error instanceof AlreadyRunning) {
      return Response.json({ error: error.message, running: true }, { status: 409 });
    }
    throw error;
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return Response.json({ running: isRunning(id) });
}
