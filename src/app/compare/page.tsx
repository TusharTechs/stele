import { buildComparables } from "@/core/library";
import { SiteHeader } from "@/components/SiteHeader";
import { Empty } from "@/components/ui";
import { CompareBoard } from "./CompareBoard";

export const dynamic = "force-dynamic";

/**
 * Two productions, side by side.
 *
 * The interesting comparison is not which film scored higher. It is how much knowledge the two
 * share, where it came from, and whether the one that inherited rules from the other actually did
 * better for it. That is the claim this project makes, held up against itself.
 */
export default async function ComparePage() {
  const projects = await buildComparables();

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-bone-500">Compare</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-bone-50">
          Two productions, and what they share
        </h1>
        <p className="mt-3 max-w-2xl text-bone-400">
          Not which one scored higher. How much knowledge they have in common, which of them proved
          it, and whether inheriting it did any good.
        </p>

        <div className="mt-8">
          {projects.length < 2 ? (
            <Empty>Two productions are needed for a comparison. There {projects.length === 1 ? "is one" : "are none"} so far.</Empty>
          ) : (
            <CompareBoard projects={projects} />
          )}
        </div>
      </main>
    </>
  );
}
