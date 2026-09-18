import { z } from "zod";
import { askGraph, UnsafeQuery, SUGGESTED_QUESTIONS } from "@/core/ask";

export const dynamic = "force-dynamic";

const AskSchema = z.object({ question: z.string().min(3).max(400) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = AskSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Ask a question between 3 and 400 characters." }, { status: 400 });
  }

  try {
    return Response.json(await askGraph(id, parsed.data.question));
  } catch (error) {
    // A query the model got wrong is a bad answer, not a server fault: 400 so the UI shows it as one.
    const status = error instanceof UnsafeQuery ? 400 : 502;
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status });
  }
}

export async function GET() {
  return Response.json({ suggestions: SUGGESTED_QUESTIONS });
}
