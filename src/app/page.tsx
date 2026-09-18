import Link from "next/link";
import { buildCinematic, findShowcase, type Cinematic, type Showcase } from "@/core/showcase";
import { buildLedger, buildLibrary } from "@/core/library";
import { SiteHeader } from "@/components/SiteHeader";
import { Wordmark } from "@/components/Logo";
import { ProofPair } from "@/components/ProofPair";
import { AmbientVideo } from "@/components/AmbientVideo";
import { Badge, Card } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * The landing page.
 *
 * Everything moving on this page was rendered by this instance. A site for a product about
 * provenance running on stock footage would be a joke at its own expense, so where nothing has been
 * rendered the cinematic treatment does not appear at all and the page falls back to type. Same
 * reason the figures are read from the store rather than written into the copy.
 */
export default async function LandingPage() {
  const [showcase, cinematic, library, ledger] = await Promise.all([
    findShowcase(),
    buildCinematic(),
    buildLibrary(),
    buildLedger(),
  ]);

  return (
    <div className="grain">
      <SiteHeader overHero />

      <main>
        <Hero cinematic={cinematic} />

        {showcase ? <Proof showcase={showcase} /> : <NoProofYet />}

        {cinematic.strip.length > 1 ? <Strip cinematic={cinematic} /> : null}

        <section className="carved">
          <div className="mx-auto max-w-5xl px-4 py-24 sm:px-6">
            <h2 className="display reveal max-w-2xl text-3xl leading-tight text-bone-50 sm:text-4xl">
              A score going up proves nothing. So we show our working.
            </h2>
            <p className="reveal mt-5 max-w-2xl text-bone-400">
              Anything can look like it is learning if you only publish the runs that improved. Two
              things here exist to make that harder to fake, including for us.
            </p>

            <div className="mt-10 grid gap-4 md:grid-cols-2">
              <Card className="reveal p-6">
                <Badge tone="knowledge">the control</Badge>
                <h3 className="display-sm mt-4 text-lg text-bone-50">Run it again, knowing nothing</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-bone-400">
                  One button runs the same brief with every lesson deliberately withheld. Same shot
                  count, same criteria, same reviewer. One variable changed. If the canon is not
                  earning its place, this is where you find out, and the result goes in the record
                  either way.
                </p>
              </Card>

              <Card className="reveal p-6">
                <Badge tone="verified">the console</Badge>
                <h3 className="display-sm mt-4 text-lg text-bone-50">Ask the graph yourself</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-bone-400">
                  Type a question in English and watch it become SPARQL you can read, run against the
                  store, and change. Not a diagram of the graph. The graph.
                </p>
              </Card>
            </div>
          </div>
        </section>

        <section className="carved">
          <div className="mx-auto max-w-5xl px-4 py-24 sm:px-6">
            <h2 className="display reveal text-3xl leading-tight text-bone-50 sm:text-4xl">How it works</h2>

            <ol className="mt-12 grid gap-10 md:grid-cols-3">
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

        <Stills cinematic={cinematic} />

        <section className="carved">
          <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
            <h2 className="display reveal text-3xl leading-tight text-bone-50 sm:text-4xl">
              What a studio actually keeps
            </h2>
            <p className="reveal mt-4 max-w-2xl text-bone-400">
              The films are the output. The rules behind them, the record of how they were made, and
              the bill for making them are the things you keep.
            </p>

            <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Surface
                href="/knowledge"
                label="Knowledge"
                headline={`${library.totals.steering} rules steering renders`}
                body="Every rule across every production, with the film that proved it and how many renders it has actually steered since."
                stat={library.totals.travelled > 0 ? `${library.totals.travelled} have crossed a project boundary` : undefined}
              />
              <Surface
                href="/gallery"
                label="Gallery"
                headline={`${cinematic.counts.shots} shots, ${cinematic.counts.frames} frames`}
                body="Everything ever rendered, each carrying the score it earned and what the render knew at the time."
              />
              <Surface
                href="/compare"
                label="Compare"
                headline="Two productions, side by side"
                body="Not which scored higher. How much knowledge they share, and whether inheriting it did any good."
              />
              <Surface
                href="/ledger"
                label="Ledger"
                headline={`$${ledger.totalUSD.toFixed(2)} across ${ledger.totalCalls} calls`}
                body="Metered by Livepeer itself on every call, successful or not."
                stat={ledger.failedCalls > 0 ? `${ledger.failedCalls} failed and were still billed` : undefined}
              />
            </div>
          </div>
        </section>

        <section className="carved">
          <div className="mx-auto max-w-5xl px-4 py-24 sm:px-6">
            <div className="grid gap-12 md:grid-cols-2">
              <div className="reveal">
                <h2 className="display text-3xl leading-tight text-bone-50">
                  The part nobody else gives you
                </h2>
                <p className="mt-5 text-bone-400">
                  Ask any AI video tool what made your clip and it has nothing to say. Which model,
                  from which frame, judged how, costing what, following whose direction. All of it
                  gone the moment the tab closed.
                </p>
                <p className="mt-4 text-bone-400">
                  Every finished production here has a page you can send someone, and that page can be
                  checked rather than read: one button re-derives the prompt hash from the clauses it
                  lists, queries the attempt back out of the knowledge graph, and re-hashes the video,
                  printing the command that reproduces each check without this app.
                </p>
                <p className="mt-4 text-bone-400">
                  The record&rsquo;s address can also be burned onto the film, so wherever the video
                  ends up, the way back travels with it.
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

              <div className="reveal">
                <h2 className="display text-3xl leading-tight text-bone-50">
                  Knowledge that outlives the project
                </h2>
                <p className="mt-5 text-bone-400">
                  A rule you proved on one film is worth something on the next one, and on a
                  colleague&rsquo;s. Approve it and it goes into shared memory; the next production
                  finds it by query and starts warm, carrying the name of the film and the studio that
                  proved it, at a discounted confidence, still waiting on someone&rsquo;s yes.
                </p>
                <p className="mt-4 text-bone-400">
                  A folder of prompts cannot do that. This is the whole reason the memory is a
                  knowledge graph and not a text file.
                </p>
                <Link
                  href="/knowledge"
                  className="mt-6 inline-block text-verdigris-400 underline-offset-4 hover:underline"
                >
                  See what it has learned →
                </Link>
              </div>
            </div>
          </div>
        </section>

        <Closing cinematic={cinematic} />
      </main>

      <footer className="carved relative z-10">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <div className="flex flex-col gap-10 sm:flex-row sm:justify-between">
            <div>
              <Wordmark />
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-bone-500">
                A stele is a slab of stone with a record cut into it, put up in public so it outlasts
                whoever cut it. That is the entire idea, applied to film.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-x-14 gap-y-2.5">
              <FooterColumn
                title="Produce"
                links={[
                  ["/studio", "Studio"],
                  ["/gallery", "Gallery"],
                ]}
              />
              <FooterColumn
                title="Record"
                links={[
                  ["/knowledge", "Knowledge"],
                  ["/compare", "Compare"],
                  ["/ledger", "Ledger"],
                ]}
              />
            </div>
          </div>

          <div className="mt-12 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-basalt-800 pt-6 font-mono text-[11px] tracking-wide text-bone-500">
            <span>Every frame, on the record.</span>
            <span className="hidden sm:inline">Built on Livepeer and the OriginTrail DKG.</span>
            <a href="/api/health" className="ml-auto transition-colors hover:text-bone-200">
              Instance health
            </a>
            <span>Apache-2.0</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

/**
 * The hero, over footage this instance rendered.
 *
 * The clip sits at low opacity under a gradient that reaches full black by the time it meets the
 * text, so the words never fight the picture. Muted, looping, and carrying a poster so the first
 * paint is an image rather than a black rectangle on a slow connection.
 */
function Hero({ cinematic }: { cinematic: Cinematic }) {
  return (
    <section className="relative isolate overflow-hidden">
      {cinematic.hero ? (
        <>
          <AmbientVideo
            src={cinematic.hero.url}
            poster={cinematic.hero.posterUrl}
            className="absolute inset-0 -z-10 h-full w-full object-cover opacity-[0.38]"
          />
          <div
            aria-hidden
            className="absolute inset-0 -z-10 bg-gradient-to-b from-basalt-950/45 via-basalt-950/80 to-basalt-950"
          />
        </>
      ) : null}

      <div className="mx-auto max-w-5xl px-4 pt-28 pb-24 sm:px-6 sm:pt-36 sm:pb-32">
        <h1 className="display max-w-3xl text-4xl leading-[1.05] text-bone-50 sm:text-6xl">
          You got the shot once.
          <br />
          <span className="text-bone-500">Then you never got it again.</span>
        </h1>

        <p className="mt-8 max-w-xl text-lg leading-relaxed text-bone-300">
          Forty prompts in, something finally lands. You could not say which word did it. Two days
          later you need one more shot that matches, and you are back at prompt one.
        </p>
        <p className="mt-4 max-w-xl text-lg leading-relaxed text-bone-400">
          Every tool you have used forgets. Stele writes down what worked, why it worked, and what it
          was trying to fix. Then it uses it.
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Link
            href="/studio"
            className="rounded bg-verdigris-500 px-5 py-2.5 font-medium text-basalt-950 transition-colors hover:bg-verdigris-400"
          >
            Open the studio
          </Link>
          <Link
            href="/gallery"
            className="rounded border border-basalt-700 px-5 py-2.5 text-bone-200 transition-colors hover:border-basalt-600"
          >
            See the work
          </Link>
        </div>

        {cinematic.hero ? (
          <p className="mt-10 font-mono text-[11px] text-bone-500">
            Behind this text: {cinematic.hero.title}, scored {cinematic.hero.score}/10 by a model that
            watched it. Rendered by this instance, like everything else on this page.
          </p>
        ) : null}
      </div>
    </section>
  );
}

/** A strip of shots, one per production, so the range reads as range rather than repetition. */
function Strip({ cinematic }: { cinematic: Cinematic }) {
  return (
    <section className="carved overflow-hidden">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <p className="reveal font-mono text-[11px] uppercase tracking-[0.2em] text-bone-500">
          {cinematic.counts.productions} productions, {cinematic.counts.shots} shots
        </p>
        <div className="reveal mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          {cinematic.strip.map((item) => (
            <Link
              key={item.url}
              href={`/studio/${item.projectId}`}
              className="group relative overflow-hidden rounded border border-basalt-800"
            >
              <AmbientVideo
                src={item.url}
                poster={item.posterUrl}
                className="aspect-[3/4] w-full object-cover opacity-70 transition-opacity group-hover:opacity-100"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-basalt-950 to-transparent p-2.5 pt-8">
                <p className="truncate text-[11px] text-bone-200">{item.title}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Stills, because a wall of frames says "this has been used" faster than a paragraph can. */
function Stills({ cinematic }: { cinematic: Cinematic }) {
  if (cinematic.stills.length < 4) return null;

  return (
    <section className="carved overflow-hidden">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="reveal grid grid-cols-3 gap-2 sm:grid-cols-5">
          {cinematic.stills.map((still, i) => (
            <Link
              key={`${still.url}-${i}`}
              href={`/studio/${still.projectId}`}
              className="group overflow-hidden rounded border border-basalt-800"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={still.url}
                alt=""
                loading="lazy"
                className="aspect-square w-full object-cover opacity-60 transition-all duration-500 group-hover:scale-105 group-hover:opacity-100"
              />
            </Link>
          ))}
        </div>
        <p className="reveal mt-5 text-center font-mono text-[11px] text-bone-500">
          Every frame above came out of this instance, with its score and its reasons on record.
        </p>
      </div>
    </section>
  );
}

function Closing({ cinematic }: { cinematic: Cinematic }) {
  return (
    <section className="carved relative isolate overflow-hidden">
      {cinematic.hero ? (
        <>
          <AmbientVideo
            src={cinematic.hero.url}
            poster={cinematic.hero.posterUrl}
            className="absolute inset-0 -z-10 h-full w-full object-cover opacity-[0.22]"
          />
          <div
            aria-hidden
            className="absolute inset-0 -z-10 bg-gradient-to-b from-basalt-950 via-basalt-950/85 to-basalt-950"
          />
        </>
      ) : null}

      <div className="mx-auto max-w-4xl px-4 py-28 text-center sm:px-6">
        <h2 className="display reveal text-3xl leading-tight text-bone-50 sm:text-5xl">
          Everything here runs on one network.
        </h2>
        <p className="reveal mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-bone-300">
          The thinking, the keyframes, the video, the voice, the edit, and the model that watches the
          result. All of it on Livepeer. The knowledge lives in the OriginTrail DKG. There is no third
          vendor holding anything.
        </p>
        <div className="reveal mt-9 flex flex-wrap justify-center gap-3">
          <Link
            href="/studio"
            className="rounded bg-verdigris-500 px-5 py-2.5 font-medium text-basalt-950 transition-colors hover:bg-verdigris-400"
          >
            Open the studio
          </Link>
          <a
            href="/api/health"
            className="rounded border border-basalt-700 px-5 py-2.5 text-bone-200 transition-colors hover:border-basalt-600"
          >
            Check what this instance is wired to
          </a>
        </div>
      </div>
    </section>
  );
}

/**
 * The argument, shown rather than made.
 *
 * Two real cuts from the same brief, the scores a model gave them, and the rules that came between.
 * If the pair does not exist, the panel does not appear.
 */
function Proof({ showcase }: { showcase: Showcase }) {
  const gain = showcase.after.score - showcase.before.score;
  const from = nameOrigins(showcase.originTitles);

  return (
    <section className="carved">
      <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <p className="reveal font-mono text-[11px] uppercase tracking-[0.2em] text-bone-500">
          from a real project in this instance
        </p>
        <h2 className="display reveal mt-4 max-w-3xl text-3xl leading-tight text-bone-50 sm:text-4xl">
          Same brief. Same reviewer.{" "}
          <span className="text-bone-500">
            {showcase.inherited
              ? "The second one knew what another production had learned."
              : "The second one knew what the first one got wrong."}
          </span>
        </h2>
        <p className="reveal mt-5 max-w-2xl text-bone-400">{showcase.goal}</p>

        {/* The claim, stated in numbers before anyone watches anything. Criteria repaired leads,
            because that is the specific checkable thing; the score follows, whichever way it went. */}
        <dl className="reveal mt-10 grid gap-px overflow-hidden rounded-lg border border-basalt-800 bg-basalt-800 sm:grid-cols-3">
          <Verdict
            value={`${showcase.criteriaFixed} of ${showcase.criteriaTotal}`}
            label={`${showcase.criteriaTotal === 1 ? "criterion" : "criteria"} the reviewer had marked failing now pass`}
            tone={showcase.criteriaFixed > 0 ? "good" : "flat"}
          />
          <Verdict
            value={`${showcase.before.score} → ${showcase.after.score}`}
            label="on the reviewer's ten point score"
            tone={gain > 0 ? "good" : gain < 0 ? "bad" : "flat"}
          />
          <Verdict
            value={String(showcase.learned.length)}
            label={from ? `rules carried over from ${from}` : "rules it learned in between"}
            tone="knowledge"
          />
        </dl>

        {gain <= 0 ? (
          <p className="reveal mt-4 max-w-2xl text-sm leading-relaxed text-bone-500">
            The score did not go up, and it is staying on the page that way. One number on a coarse
            scale is a model&rsquo;s summary impression and it moves for reasons nobody can audit.
            Which named criteria passed is the specific claim, so that is what this ranks on.
          </p>
        ) : null}

        <div className="reveal mt-10">
          <ProofPair
            before={showcase.before}
            after={showcase.after}
            beforeLabel={`Attempt ${showcase.before.attempt} · knowing nothing`}
            afterLabel={`Attempt ${showcase.after.attempt} · ${
              showcase.inherited ? "steered by another film's rules" : "steered by what it learned"
            }`}
          />
        </div>

        {showcase.learned.length > 0 ? (
          <div className="reveal mt-14 border-t border-basalt-800 pt-9">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-bone-500">
              {from ? `what it brought over from ${from}` : "what it learned in between"}
            </p>
            <ol className="mt-6 grid gap-x-10 gap-y-5 sm:grid-cols-2">
              {showcase.learned.slice(0, 4).map((clause, i) => (
                <li key={clause.index} className="flex gap-4 border-l border-bronze-400/35 pl-4">
                  <span className="mt-[3px] font-mono text-[11px] tabular-nums text-bronze-400">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <p className="text-sm leading-relaxed text-bone-300">{clause.body}</p>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/**
 * The productions a set of rules came from, written the way a person would say it.
 *
 * Two names read fine. Three or more in a caption is a list nobody finishes, so past two it becomes
 * a count, and the names are still one click away on the knowledge page.
 */
function nameOrigins(titles: string[]): string | undefined {
  if (titles.length === 0) return undefined;
  if (titles.length === 1) return titles[0];
  if (titles.length === 2) return `${titles[0]} and ${titles[1]}`;
  return `${titles.length} other productions`;
}

/** One cell of the verdict strip. Colour follows the product's rule, never the direction of the copy. */
function Verdict({
  value,
  label,
  tone,
}: {
  value: string;
  label: string;
  tone: "good" | "bad" | "flat" | "knowledge";
}) {
  const colour =
    tone === "good"
      ? "text-verdigris-400"
      : tone === "bad"
        ? "text-terracotta-400"
        : tone === "knowledge"
          ? "text-bronze-300"
          : "text-bone-200";

  return (
    <div className="bg-basalt-900 px-5 py-5">
      <dt className={`font-mono text-2xl tabular-nums ${colour}`}>{value}</dt>
      <dd className="mt-1.5 text-[13px] leading-snug text-bone-500">{label}</dd>
    </div>
  );
}

function NoProofYet() {
  return (
    <section className="carved">
      <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <Card className="p-6">
          <p className="text-bone-300">
            This instance has no finished productions yet, so there is nothing real to show you here,
            and a mock-up would defeat the point.
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

function Surface({
  href,
  label,
  headline,
  body,
  stat,
}: {
  href: string;
  label: string;
  headline: string;
  body: string;
  stat?: string;
}) {
  return (
    <Link
      href={href}
      className="reveal group rounded-lg border border-basalt-800 bg-basalt-900 p-5 transition-colors hover:border-basalt-700"
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-bone-500">{label}</span>
      <h3 className="display-sm mt-2.5 text-[15px] text-bone-50">{headline}</h3>
      <p className="mt-2 text-[13px] leading-relaxed text-bone-400">{body}</p>
      {stat ? <p className="mt-2.5 font-mono text-[11px] text-bronze-300">{stat}</p> : null}
      <span className="mt-3 inline-block text-[13px] text-verdigris-400 transition-transform group-hover:translate-x-0.5">
        Open →
      </span>
    </Link>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <li className="reveal">
      <span className="font-mono text-[11px] tracking-wider text-verdigris-400">{n}</span>
      <h3 className="display-sm mt-2 text-lg text-bone-50">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-bone-400">{body}</p>
    </li>
  );
}

function FooterColumn({ title, links }: { title: string; links: Array<[string, string]> }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-bone-500">{title}</p>
      <ul className="mt-3 space-y-2">
        {links.map(([href, label]) => (
          <li key={href}>
            <Link href={href} className="text-sm text-bone-300 transition-colors hover:text-bone-50">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
