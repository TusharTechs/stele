import { loadProject } from "@/core/store";
import { offerInheritedLessons } from "@/core/intake";
import { isRunning } from "@/core/runner";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await loadProject(id);
  if (!project) return Response.json({ error: "No such project." }, { status: 404 });

  // Offers are read from shared memory on every load rather than cached: another studio may have
  // accepted something since the last look, and a stale offer list would hide exactly the
  // cross-project transfer this is here to demonstrate. A store that is down must not 404 the page.
  const offers = await offerInheritedLessons(project).catch(() => []);

  return Response.json({ project, offers, running: isRunning(id) });
}
