import Link from "next/link";
import { listProjects } from "@/core/store";
import { SiteHeader } from "@/components/SiteHeader";
import { Badge, Card } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const projects = await listProjects();
  const featured = projects.find((p) => p.runs.some((r) => r.review)) ?? projects[0];

  return (
    <>
      <SiteHeader />

      <main>
        <section className="mx-auto max-w-4xl px-4 pt-20 pb-16 sm:px-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-bone-500">
            Livepeer Agent × OriginTrail DKG
          </p>
          <h1 className="mt-4 text-4xl leading-tight font-semibold text-bone-50 sm:text-5xl">
            An AI studio whose memory and its receipts
            <br className="hidden sm:block" /> are{" "}
            <span className="text-verdigris-400">the same knowledge graph</span>.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-bone-400">
            Generative media is a slot machine: you re-roll prompts, lose everything you learned, and
            end up with a file nobody can trace. Stele keeps what a production learns as verifiable
            knowledge you own — and that same knowledge is what steers the next render.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/studio"
              className="rounded bg-verdigris-500 px-4 py-2 font-medium text-basalt-950 transition-colors hover:bg-verdigris-400"
            >
              Open the studio
            </Link>
            {featured ? (
              <Link
                href={`/record/${featured.id}`}
                className="rounded border border-basalt-700 px-4 py-2 text-bone-200 transition-colors hover:border-basalt-600"
              >
                See a production record
              </Link>
            ) : null}
          </div>
        </section>

        <section className="carved">
          <div className="mx-auto grid max-w-6xl gap-4 px-4 py-16 sm:px-6 md:grid-cols-3">
            <Pillar
              tone="knowledge"
              label="the loop"
              title="Prompts are compiled from the graph"
              body="Before every render, a SPARQL query returns the constraints and lessons this production has proved. Each one becomes a clause, and each clause keeps the identity of the knowledge it came from — so when a score moves, whether memory caused it is a join, not a claim."
            />
            <Pillar
              tone="verified"
              label="the gate"
              title="The reviewer watches the footage"
              body="A video-understanding model on the Livepeer network judges the clip itself against each criterion, and a shot it rejects is rendered again with the reason attached. A quality report nothing acts on is decoration."
            />
            <Pillar
              tone="neutral"
              label="the record"
              title="Every frame leaves a receipt"
              body="What made this, from what, judged by what, at what cost, under whose direction — written to the DKG as a Run Ledger, and sealable to Verifiable Memory for a UAL anyone can check."
            />
          </div>
        </section>

        <section className="carved">
          <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
            <h2 className="text-2xl font-semibold text-bone-50">Two things you can check yourself</h2>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <Card className="p-5">
                <Badge tone="knowledge">the control</Badge>
                <h3 className="mt-3 font-medium text-bone-50">A paired experiment, not a claim</h3>
                <p className="mt-2 text-sm text-bone-400">
                  One click runs the same brief twice — once steered by the canon, once with every
                  learned lesson deliberately withheld. A score that rises is only evidence if you can
                  see what it rose against.
                </p>
              </Card>

              <Card className="p-5">
                <Badge tone="verified">the console</Badge>
                <h3 className="mt-3 font-medium text-bone-50">Ask the graph anything</h3>
                <p className="mt-2 text-sm text-bone-400">
                  A live SPARQL console sits inside the studio, and its first preset is the exact query
                  the prompt compiler runs before every render. Nothing here asks to be taken on trust.
                </p>
              </Card>
            </div>

            <p className="mt-8 text-sm text-bone-500">
              Everything runs on Livepeer Agent and nothing else — reasoning, keyframes, video,
              narration, the cut, and the review. Knowledge lives in the OriginTrail DKG.{" "}
              <a href="/api/health" className="text-verdigris-400 hover:underline">
                Check what this instance is wired to
              </a>
              .
            </p>
          </div>
        </section>
      </main>

      <footer className="carved">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-8 text-sm text-bone-500 sm:px-6">
          <span>Stele — every frame, on the record.</span>
          <span className="ml-auto">Apache-2.0</span>
        </div>
      </footer>
    </>
  );
}

function Pillar({
  tone,
  label,
  title,
  body,
}: {
  tone: "knowledge" | "verified" | "neutral";
  label: string;
  title: string;
  body: string;
}) {
  return (
    <Card className="p-5">
      <Badge tone={tone}>{label}</Badge>
      <h3 className="mt-3 text-lg font-medium text-bone-50">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-bone-400">{body}</p>
    </Card>
  );
}
