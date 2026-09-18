import { z } from "zod";
import { createProject } from "@/core/intake";
import { listProjects } from "@/core/store";
import { BriefSchema } from "@/core/schemas";

export const dynamic = "force-dynamic";

export async function GET() {
  const projects = await listProjects();
  // The list view needs a headline, not a whole production history.
  return Response.json({
    projects: projects.map((project) => ({
      id: project.id,
      title: project.title,
      goal: project.brief.goal,
      agentLabel: project.agentLabel,
      updatedAt: project.updatedAt,
      attempts: project.runs.length,
      bestScore: project.runs.reduce<number | undefined>(
        (best, run) => (run.review && (best === undefined || run.review.score > best) ? run.review.score : best),
        undefined
      ),
      lessonCount: project.lessons.filter((l) => l.status === "accepted" || l.status === "pinned").length,
      sealed: project.seals.length > 0,
    })),
  });
}

const CreateSchema = z.object({
  brief: BriefSchema,
  agentLabel: z.string().min(1).max(40).optional(),
});

export async function POST(request: Request) {
  const parsed = CreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid brief." }, { status: 400 });
  }

  try {
    const project = await createProject(parsed.data);
    return Response.json({ project }, { status: 201 });
  } catch (error) {
    return Response.json({ error: message(error) }, { status: 502 });
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
