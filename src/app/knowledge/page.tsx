import Link from "next/link";
import { buildLibrary } from "@/core/library";
import { SiteHeader } from "@/components/SiteHeader";
import { Card, Empty, SectionTitle } from "@/components/ui";
import { RuleFilters } from "./RuleFilters";

export const dynamic = "force-dynamic";

/**
 * Everything the studio has learned, in one place.
 *
 * The productions are the output; this is the asset. A rule proved on one film, still carrying who
 * proved it and how many renders it has since steered, is the thing a studio would actually pay to
 * keep — and the thing a folder of prompts cannot give you.
 */
export default async function KnowledgePage() {
  const { rules, projects, totals } = await buildLibrary();

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-bone-500">Knowledge</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-bone-50">
          Everything this studio has learned
        </h1>
        <p className="mt-3 max-w-2xl text-bone-400">
          Every rule across every production, with the film that proved it and how many renders it has
          actually steered since. Only rules a human accepted reach a prompt.
        </p>

        <dl className="mt-7 flex flex-wrap gap-x-8 gap-y-3 font-mono text-[11px]">
          <Stat label="productions" value={totals.productions} />
          <Stat label="steering renders" value={totals.steering} tone="verified" />
          <Stat label="awaiting review" value={totals.proposed} tone="knowledge" />
          <Stat label="rejected" value={totals.rejected} />
          <Stat label="crossed a project" value={totals.travelled} tone="knowledge" />
        </dl>

        <div className="mt-8">
          <SectionTitle hint={`${rules.length} rules, most-used first`}>The canon</SectionTitle>
          {rules.length === 0 ? (
            <Empty>
              Nothing learned yet. Run a production, then accept what the reviewer taught it.
            </Empty>
          ) : (
            <RuleFilters rules={rules} projects={projects} />
          )}
        </div>

        <Card className="mt-8 p-5">
          <h2 className="font-medium text-bone-50">Why this page exists</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-bone-400">
            A production is worth something once. The rules it proved are worth something on every
            film after it, and on a colleague&rsquo;s. Because they live in a knowledge graph rather
            than a prompt file, a new production can find them by query, inherit them with attribution
            intact, and start knowing what the last one had to learn the hard way.
          </p>
          <Link
            href="/studio"
            className="mt-4 inline-block text-verdigris-400 underline-offset-4 hover:underline"
          >
            Start a production from one of these canons →
          </Link>
        </Card>
      </main>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "verified" | "knowledge" }) {
  const colour = tone === "verified" ? "text-verdigris-400" : tone === "knowledge" ? "text-bronze-300" : "text-bone-200";
  return (
    <div>
      <dt className="uppercase tracking-wider text-bone-500">{label}</dt>
      <dd className={`mt-1 text-xl tabular-nums ${colour}`}>{value}</dd>
    </div>
  );
}
