import { loadProject } from "@/core/store";
import { buildCanon, buildRunLedger } from "@/dkg/serialize";

export const dynamic = "force-dynamic";

/**
 * Take the knowledge with you.
 *
 * The point of keeping a canon in RDF rather than a private schema is that it is portable, and a
 * portability claim you cannot exercise is decoration. This serves the same two assets the store
 * writes, in the form it writes them, so what downloads here is byte-identical to what a DKG node
 * holds rather than a re-rendered summary of it.
 *
 * Turtle is the canonical form. JSON-LD is offered because it is what most tooling outside the RDF
 * world will actually accept, and it is produced by parsing the Turtle rather than by a second
 * serialiser that could drift from it.
 */
const FORMATS = {
  ttl: { mime: "text/turtle; charset=utf-8", ext: "ttl" },
  jsonld: { mime: "application/ld+json; charset=utf-8", ext: "jsonld" },
} as const;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(request.url);
  const asset = url.searchParams.get("asset") === "ledger" ? "ledger" : "canon";
  const format = (url.searchParams.get("format") ?? "ttl") as keyof typeof FORMATS;

  if (!FORMATS[format]) {
    return Response.json({ error: "Format must be ttl or jsonld." }, { status: 400 });
  }

  const project = await loadProject(id);
  if (!project) return Response.json({ error: "No such project." }, { status: 404 });

  const turtle = asset === "ledger" ? buildRunLedger(project) : buildCanon(project);
  const filename = `stele-${id}-${asset}.${FORMATS[format].ext}`;

  let body = turtle;
  if (format === "jsonld") {
    try {
      const oxigraph = await import("oxigraph");
      const store = new oxigraph.Store();
      store.load(turtle, { format: "text/turtle" });
      body = store.dump({ format: "application/ld+json" }) as string;
    } catch (error) {
      return Response.json(
        { error: `Could not convert to JSON-LD: ${error instanceof Error ? error.message : String(error)}` },
        { status: 500 }
      );
    }
  }

  return new Response(body, {
    headers: {
      "content-type": FORMATS[format].mime,
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
