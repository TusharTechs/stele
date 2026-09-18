import { verifyRecord } from "@/core/verify";

export const dynamic = "force-dynamic";

/**
 * Re-derives the record's claims and reports what agreed.
 *
 * A GET rather than a POST because it changes nothing: every check reads, recomputes and compares.
 * It is safe to run repeatedly, and safe to link to.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    return Response.json(await verifyRecord(id));
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }
}
