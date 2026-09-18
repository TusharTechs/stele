import Link from "next/link";
import { findShowcase, type ClipRef, type Showcase } from "@/core/showcase";
import { SiteHeader } from "@/components/SiteHeader";
import { Badge, Card } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const showcase = await findShowcase();

  return (
    <>
      <SiteHeader />

      <main>
        <section className="mx-auto max-w-5xl px-4 pt-24 pb-16 sm:px-6">
          <h1 className="max-w-3xl text-4xl leading-[1.08] font-semibold tracking-tight text-bone-50 sm:text-6xl">
            You got the shot once.
            <br />
            <span className="text-bone-500">Then you never got it again.</span>
          </h1>

          <p className="mt-8 max-w-xl text-lg leading-relaxed text-bone-300">
            Forty prompts in, something finally lands. You could not say which word did it. Two days
            later you need one more shot that matches, and you are back at prompt one.
          </p>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-bone-400">
            Every tool you have used forgets. Stele writes down what worked, why it worked, and what
            it was trying to fix. Then it uses it.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link
              href="/studio"
              className="rounded bg-verdigris-500 px-5 py-2.5 font-medium text-basalt-950 transition-colors hover:bg-verdigris-400"
            >
              Open the studio
            </Link>
            {showcase ? (
              <Link
                href={`/record/${showcase.project.id}`}
                className="rounded border border-basalt-700 px-5 py-2.5 text-bone-200 transition-colors hover:border-basalt-600"
              >
                Read a production record
              </Link>
            ) : null}
          </div>
        </section>

        {showcase ? <Proof showcase={showcase} /> : <NoProofYet />}

        <section className="carved">
          <div className="mx-auto max-w-5xl px-4 py-20 sm:px-6">
            <h2 className="max-w-2xl text-3xl leading-tight font-semibold tracking-tight text-bone-50">
              A score going up proves nothing. So we show our working.
            </h2>
            <p className="mt-5 max-w-2xl text-bone-400">
              Anything can look like it is learning if you only publish the runs that improved. Two
              things here exist to make that harder to fake, including for us.
            </p>

            <div className="mt-10 grid gap-4 md:grid-cols-2">
              <Card className="p-6">
                <Badge tone="knowledge">the control</Badge>
                <h3 className="mt-4 text-lg font-medium text-bone-50">Run it again, knowing nothing</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-bone-400">
                  One button runs the same brief with every lesson deliberately withheld. Same shot
                  count, same criteria, same reviewer. One variable changed. If the canon is not
                  earning its place, this is where you find out, and the result goes in the record
                  either way.
                </p>
              </Card>

              <Card className="p-6">
                <Badge tone="verified">the console</Badge>
                <h3 className="mt-4 text-lg font-medium text-bone-50">Ask the graph yourself</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-bone-400">
                  There is a SPARQL box inside the studio, and the first query in it is the one the
                  prompt compiler runs before every render. Not a diagram of the graph. The graph.
                  Change the query and see what the machine sees.
                </p>
              </Card>
            </div>
          </div>
        </section>

        <section className="carved">
          <div className="mx-auto max-w-5xl px-4 py-20 sm:px-6">
            <h2 className="text-3xl leading-tight font-semibold tracking-tight text-bone-50">
              How it works
            </h2>

            <ol className="mt-10 grid gap-8 md:grid-cols-3">
              <Step
                n="01"
                title="It reads before it writes"
                body="Every render starts with a query, not a prompt. Constraints you set and lessons you approved come back as rows, and each row becomes one clause. The prompt is assembled, not stored, so knowledge added today changes the render tonight."
              />
              <Step
                n="02"
                title="A model watches the cut"
                body="Not a caption model reading a description. A video model that plays the clip and scores it against your criteria one by one. A shot it rejects goes back and gets rendered again with the reason attached, twice at most, so one stubborn frame cannot eat the budget."
              />
              <Step
                n="03"
                title="You decide what it keeps"
                body="What the reviewer found gets turned into rules for next time, and then it waits. Nothing steers a render until you accept it. A confident wrong note is indistinguishable from a right one, and the wrong one would poison every attempt after it."
              />
            </ol>
          </div>
        </section>

        <section className="carved">
          <div className="mx-auto max-w-5xl px-4 py-20 sm:px-6">
            <div className="grid gap-10 md:grid-cols-2">
              <div>
                <h2 className="text-3xl leading-tight font-semibold tracking-tight text-bone-50">
                  The part nobody else gives you
                </h2>
                <p className="mt-5 text-bone-400">
                  Ask any AI video tool what made your clip and it has nothing to say. Which model,
                  from which frame, judged how, costing what, following whose direction. All of it gone the
                  moment the tab closed.
                </p>
                <p className="mt-4 text-bone-400">
                  Every finished production here has a page you can send someone. It lists the
                  capabilities that touched it, the criteria it was judged against, the rules that
                  steered it and where each one came from, and what the network charged. Seal it and
                  that record is anchored on chain with an address anyone can resolve. No account, no
                  access to this machine, no need to take our word for it.
                </p>
                {showcase ? (
                  <Link
                    href={`/record/${showcase.project.id}`}
                    className="mt-6 inline-block text-verdigris-400 underline-offset-4 hover:underline"
                  >
                    Look at a real one →
                  </Link>
                ) : null}
              </div>

              <div>
                <h2 className="text-3xl leading-tight font-semibold tracking-tight text-bone-50">
                  Knowledge that outlives the project
                </h2>
                <p className="mt-5 text-bone-400">
                  A rule you proved on one film is worth something on the next one, and on a
                  colleague&rsquo;s. Approve it and it goes into shared memory; the next production
                  finds it by query and starts warm, carrying the name of the film and the studio
                  that proved it, at a discounted confidence, still waiting on someone&rsquo;s yes.
                </p>
                <p className="mt-4 text-bone-400">
                  A folder of prompts cannot do that. This is the whole reason the memory is a
                  knowledge graph and not a text file.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="carved">
          <div className="mx-auto max-w-5xl px-4 py-20 sm:px-6">
            <p className="max-w-3xl text-xl leading-relaxed text-bone-300">
              Everything here runs on one network. The thinking, the keyframes, the video, the voice,
              the edit, and the model that watches the result. All of it on{" "}
              <span className="text-bone-50">Livepeer</span>. The knowledge lives in the{" "}
              <span className="text-bone-50">OriginTrail DKG</span>. There is no third vendor holding
              anything.
            </p>
            <p className="mt-6 text-sm text-bone-500">
              <a href="/api/health" className="text-verdigris-400 underline-offset-4 hover:underline">
                See exactly what this instance is wired to
              </a>{" "}
              . It will tell you whether the knowledge store is the real thing or the local fallback.
            </p>
          </div>
        </section>
      </main>

      <footer className="carved">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 px-4 py-10 text-sm text-bone-500 sm:px-6">
          <span className="font-mono tracking-wider text-bone-400">STELE</span>
          <span>Every frame, on the record.</span>
          <span className="ml-auto">Apache-2.0</span>
        </div>
      </footer>
    </>
  );
}

/**
 * The argument, shown rather than made.
 *
 * Two real cuts from the same brief, the scores a model gave them, and the rules that came between.
 * Everything on this panel is read from actual project history — if the pair does not exist, the
 * panel does not appear.
 */
function Proof({ showcase }: { showcase: Showcase }) {
  const gain = showcase.after.score - showcase.before.score;

  return (
    <section className="carved">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-xl font-medium text-bone-50">
            Same brief. Same reviewer.{" "}
            {showcase.inherited
              ? "The second one knew what another production had learned."
              : "The second one knew what the first one got wrong."}
          </h2>
          <p className="font-mono text-[11px] text-bone-500">from a real project in this instance</p>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-bone-400">{showcase.goal}</p>

        <div className="mt-8 grid items-start gap-6 lg:grid-cols-[1fr_260px_1fr]">
          <Clip label={`Attempt ${showcase.before.attempt} · knowing nothing`} clip={showcase.before} />

          <div className="lg:pt-10">
            <p className="font-mono text-[11px] uppercase tracking-wider text-bone-500">
              {showcase.inherited ? "what it inherited from another production" : "what it learned in between"}
            </p>
            <ul className="mt-3 grid gap-2">
              {showcase.learned.slice(0, 4).map((clause) => (
                <li
                  key={clause.index}
                  className="rounded border border-bronze-400/30 bg-bronze-900/40 px-3 py-2 text-[13px] leading-snug text-bone-200"
                >
                  {clause.body}
                </li>
              ))}
            </ul>
            {/* Criteria first: a score is one number on a coarse scale, and a pair can repair real
                faults without moving it. Naming what was actually fixed is the checkable claim. */}
            {showcase.criteriaFixed > 0 ? (
              <p className="mt-4 font-mono text-sm text-verdigris-400">
                {showcase.criteriaFixed} {showcase.criteriaFixed === 1 ? "criterion" : "criteria"} went
                from failing to passing
              </p>
            ) : null}
            {gain !== 0 ? (
              <p className={`mt-1 font-mono text-sm ${gain > 0 ? "text-verdigris-400" : "text-terracotta-400"}`}>
                {gain > 0 ? "+" : ""}
                {gain.toFixed(Math.abs(gain) % 1 ? 1 : 0)} on the reviewer&rsquo;s score
              </p>
            ) : null}
          </div>

          <Clip label={`Attempt ${showcase.after.attempt} · ${showcase.inherited ? "steered by another film's rules" : "steered by it"}`} clip={showcase.after} highlight />
        </div>
      </div>
    </section>
  );
}

function Clip({ label, clip, highlight }: { label: string; clip: ClipRef; highlight?: boolean }) {
  const { score, url, summary, posterUrl } = clip;
  return (
    <figure>
      {/* Posters are the shot's own keyframe. Without one the panel is two black rectangles until
          someone presses play, which buries the entire argument of the page below a click. */}
      <video
        src={url}
        poster={posterUrl}
        controls
        muted
        loop
        playsInline
        preload="metadata"
        className={`aspect-video w-full rounded-lg border bg-black object-cover ${
          highlight ? "border-verdigris-500/40" : "border-basalt-800"
        }`}
      />
      <figcaption className="mt-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-mono text-[11px] uppercase tracking-wider text-bone-500">{label}</span>
          <span
            className={`font-mono text-lg tabular-nums ${highlight ? "text-verdigris-400" : "text-bone-300"}`}
          >
            {score}
            <span className="text-xs text-bone-500">/10</span>
          </span>
        </div>
        <p className="mt-1.5 text-[13px] leading-snug text-bone-500">{summary}</p>
      </figcaption>
    </figure>
  );
}

function NoProofYet() {
  return (
    <section className="carved">
      <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <Card className="p-6">
          <p className="text-bone-300">
            This instance has no finished productions yet, so there is nothing real to show you here
            , and a mock-up would defeat the point.
          </p>
          <p className="mt-3 text-sm text-bone-500">
            Run one brief twice in the studio and this space fills with both cuts, the scores a model
            gave them, and the rules that came between.
          </p>
        </Card>
      </div>
    </section>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <li>
      <span className="font-mono text-[11px] tracking-wider text-verdigris-400">{n}</span>
      <h3 className="mt-2 text-lg font-medium text-bone-50">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-bone-400">{body}</p>
    </li>
  );
}
