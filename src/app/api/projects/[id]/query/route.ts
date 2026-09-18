import { z } from "zod";
import { knowledgeStore } from "@/dkg/client";
import { SAMPLE_QUERIES } from "@/dkg/queries";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({ sparql: z.string().min(10).max(8000) });

/**
 * Run a SPARQL query against the knowledge store.
 *
 * Exposed to the UI so anyone evaluating this can ask the graph their own questions rather than
 * taking the product's word for what it contains. The query the compiler runs before every render
 * is one of the presets, so "does the prompt really come from the graph" is checkable by hand.
 *
 * Reads only. A store that accepts SPARQL Update from the browser would let any page rewrite the
 * provenance record, which defeats the point of having one.
 */
const MUTATING = /\b(INSERT|DELETE|DROP|CLEAR|LOAD|CREATE|COPY|MOVE|ADD)\b/i;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await params;
  const parsed = QuerySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid query." }, { status: 400 });
  }

  const sparql = parsed.data.sparql;
  if (MUTATING.test(sparql)) {
    return Response.json(
      { error: "This endpoint is read-only. SELECT, ASK, CONSTRUCT and DESCRIBE only." },
      { status: 400 }
    );
  }

  try {
    const result = await knowledgeStore().query(sparql);
    return Response.json({
      bindings: result.bindings.slice(0, 500),
      truncated: result.bindings.length > 500,
      servedBy: result.servedBy,
      ms: result.ms,
    });
  } catch (error) {
    return Response.json({ error: message(error) }, { status: 400 });
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return Response.json({
    presets: SAMPLE_QUERIES.map((preset) => ({
      label: preset.label,
      description: preset.description,
      sparql: preset.build(id),
    })),
  });
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
