import { z } from "zod";
import { updateProject } from "@/core/store";
import { knowledgeStore } from "@/dkg/client";
import { safeText } from "@/dkg/redact";
import { LessonSchema, type Lesson } from "@/core/schemas";
import { isReadOnly, readOnlyResponse } from "@/core/deploy";

export const dynamic = "force-dynamic";

/**
 * Curating the canon.
 *
 * This is the human step, and it is the point of difference against a loop that feeds everything it
 * learns straight back into itself. A lesson is a machine's guess until someone says otherwise;
 * accepting one is a decision with consequences for every later render, so the decision is recorded
 * in the graph with its author rather than applied invisibly.
 *
 * Accepting or rejecting bumps the canon version, because the knowledge that steers renders has
 * changed and later runs should be comparable by which version they compiled against.
 */
const CurateSchema = z.object({
  action: z.enum(["accept", "reject", "pin", "edit", "adopt"]),
  lessonId: z.string().min(1),
  /** Required for `edit`; the human's wording replaces the model's. */
  body: z.string().min(4).max(240).optional(),
  /** Required for `adopt`: the full inherited lesson, which does not yet exist on this project. */
  lesson: LessonSchema.optional(),
  curatedBy: z.string().min(1).max(40).default("you"),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (isReadOnly()) return readOnlyResponse();

  const { id } = await params;
  const parsed = CurateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }

  const { action, lessonId, body, lesson, curatedBy } = parsed.data;
  if (action === "edit" && !body) {
    return Response.json({ error: "An edit needs a body." }, { status: 400 });
  }
  if (action === "adopt" && !lesson) {
    return Response.json({ error: "Adopting needs the lesson being adopted." }, { status: 400 });
  }

  try {
    const project = await updateProject(id, (current) => {
      const now = Date.now();

      if (action === "adopt") {
        // An inherited lesson does not exist here yet; adopting copies it in, still unaccepted, with
        // its origin intact so the graph keeps saying whose project proved it.
        if (current.lessons.some((l) => l.id === lesson!.id)) return current;
        return {
          ...current,
          lessons: [...current.lessons, { ...lesson!, status: "proposed" as const }],
          inheritedLessonIds: [...new Set([...current.inheritedLessonIds, lesson!.id])],
        };
      }

      const lessons = current.lessons.map((l): Lesson => {
        if (l.id !== lessonId) return l;
        if (action === "edit") return { ...l, body: safeText(body!, 240), curatedBy, curatedAt: now };
        return {
          ...l,
          status: action === "accept" ? "accepted" : action === "reject" ? "rejected" : "pinned",
          curatedBy,
          curatedAt: now,
        };
      });

      const changed = lessons.some((l, i) => l.status !== current.lessons[i]?.status);
      return { ...current, lessons, canonVersion: changed ? current.canonVersion + 1 : current.canonVersion };
    });

    // Write straight through: the next compile reads the graph, not this file, so a canon change
    // that never reached the store would silently fail to steer anything.
    await knowledgeStore().write(project);

    return Response.json({ project });
  } catch (error) {
    return Response.json({ error: message(error) }, { status: 500 });
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
