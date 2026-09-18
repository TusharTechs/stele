import Link from "next/link";
import { notFound } from "next/navigation";
import { loadProject } from "@/core/store";
import { SiteHeader } from "@/components/SiteHeader";
import { VerifyPanel } from "./VerifyPanel";
import { Badge, Card, Empty, Money, SectionTitle, Score } from "@/components/ui";
import type { Clause } from "@/core/schemas";

export const dynamic = "force-dynamic";

/**
 * The production record — the page the whole project exists to be able to hand someone.
 *
 * It answers, for a finished film, the questions a viewer cannot otherwise answer about anything
 * generated: what made this, from what, judged by what, at what cost, and under whose direction. It
 * is deliberately readable by someone with no account and no context, because a provenance record
 * that only its author can interpret is not a provenance record.
 */
export default async function RecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await loadProject(id);
  if (!project) notFound();

  const run = project.runs.filter((r) => r.stage === "COMPLETE" && r.review).at(-1);
  const seal = project.seals.at(-1);

  const capabilities = [...new Set((run?.calls ?? []).filter((c) => c.ok).map((c) => c.capability))];
  const learned = run?.basePrompt?.clauses.filter((c) => c.sourceKind === "lesson") ?? [];

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-bone-500">Production record</p>
        <h1 className="mt-2 text-3xl font-semibold text-bone-50">{project.title}</h1>
        <p className="mt-2 text-bone-400">{project.brief.goal}</p>

        <div className="mt-4 flex flex-wrap gap-2">
          {seal?.ual ? (
            <Badge tone="verified">anchored on {seal.network}</Badge>
          ) : (
            <Badge tone="neutral">not sealed to a chain</Badge>
          )}
          <Badge tone="knowledge">canon v{project.canonVersion}</Badge>
          <Badge tone="neutral">studio {project.agentLabel}</Badge>
        </div>

        {!run ? (
          <div className="mt-10">
            <Empty>This production has no finished attempt yet.</Empty>
          </div>
        ) : (
          <>
            <section className="mt-10">
              {run.cutUrl ? (
                <video
                  src={run.cutUrl}
                  poster={run.shots.find((shot) => shot.keyframeUrl)?.keyframeUrl}
                  controls
                  playsInline
                  preload="metadata"
                  className="aspect-video w-full rounded-lg border border-basalt-800 bg-black"
                />
              ) : null}
              <Card className="mt-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <p className="max-w-lg text-sm text-bone-200">{run.review!.summary}</p>
                  <Score value={run.review!.score} target={project.brief.targetScore} />
                </div>
                <p className="mt-3 font-mono text-[10px] uppercase tracking-wider text-bone-500">
                  judged by {run.review!.capability} · a model that watched the clip
                </p>
              </Card>
            </section>

            <Row title="Judged against">
              <ul className="grid gap-2">
                {run.review!.verdicts.map((verdict) => {
                  const criterion = project.brief.criteria.find((c) => c.index === verdict.index);
                  return (
                    <li key={verdict.index} className="flex gap-3 text-sm">
                      <span className={verdict.met ? "text-verdigris-400" : "text-terracotta-400"}>
                        {verdict.met ? "✓" : "✕"}
                      </span>
                      <span className="text-bone-300">{criterion?.body ?? `criterion ${verdict.index}`}</span>
                    </li>
                  );
                })}
              </ul>
            </Row>

            <Row title="Made by" hint={`${capabilities.length} capabilities on the Livepeer network`}>
              <ul className="flex flex-wrap gap-1.5">
                {capabilities.map((capability) => (
                  <li
                    key={capability}
                    className="rounded border border-basalt-700 bg-basalt-850 px-2 py-0.5 font-mono text-[11px] text-bone-300"
                  >
                    {capability}
                  </li>
                ))}
              </ul>
              <p className="mt-3 font-mono text-[11px] text-bone-500">
                {run.calls.length} calls · <Money usd={run.costUSD} /> · metered by the network itself
              </p>
            </Row>

            <Row title="Steered by" hint={steeredByHint(learned)}>
              {learned.length === 0 ? (
                <p className="text-sm text-bone-500">
                  This attempt compiled from the brief and its constraints. Nothing learned had been
                  accepted into the canon yet.
                </p>
              ) : (
                <ul className="grid gap-2">
                  {learned.map((clause) => (
                    <li key={clause.index} className="rounded border border-bronze-400/30 bg-bronze-900/40 px-3 py-2">
                      <p className="text-sm text-bone-200">{clause.body}</p>
                      <p className="mt-1 text-[11px] text-bronze-300">
                        {clause.originProjectId && clause.originProjectId !== project.id ? (
                          <>
                            proved by{" "}
                            <span className="font-medium">
                              {clause.originProjectTitle ?? "another production"}
                            </span>{" "}
                            on its attempt {clause.sourceAttempt}, and adopted here
                          </>
                        ) : (
                          <>learned on this production&rsquo;s attempt {clause.sourceAttempt}</>
                        )}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Row>

            {project.sources.length > 0 ? (
              <Row title="Grounded in">
                <ul className="grid gap-1.5">
                  {project.sources.map((source) => (
                    <li key={source.url} className="text-sm">
                      <a
                        href={source.url}
                        rel="noreferrer nofollow"
                        target="_blank"
                        className="text-verdigris-400 underline-offset-2 hover:underline"
                      >
                        {source.url}
                      </a>
                      <span className="ml-2 font-mono text-[10px] text-bone-500">
                        sha256 {source.excerptHash.slice(0, 12)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Row>
            ) : null}

            <VerifyPanel projectId={project.id} />

            <Row title="Integrity">
              <dl className="grid gap-2 font-mono text-[11px]">
                <Pair label="attempt" value={`${run.attempt} of ${project.runs.length}`} />
                <Pair label="prompt sha256" value={run.basePrompt?.promptHash ?? "—"} />
                {run.cutUrl ? <Pair label="cut" value={run.cutUrl} wrap /> : null}
                {seal?.ual ? <Pair label="UAL" value={seal.ual} wrap /> : null}
                {seal?.txHash ? <Pair label="tx" value={seal.txHash} wrap /> : null}
                <Pair label="context graph" value={seal?.contextGraph ?? "—"} />
              </dl>
              {!seal ? (
                <p className="mt-3 text-xs text-bone-500">
                  Not yet sealed. Until a production is published to Verifiable Memory, this record is
                  verifiable only against this instance. That is the honest statement of what it is.
                </p>
              ) : null}
            </Row>
          </>
        )}

        <p className="mt-12 border-t border-basalt-800 pt-6 text-sm text-bone-500">
          <Link href={`/studio/${project.id}`} className="text-verdigris-400 hover:underline">
            Open in the studio
          </Link>{" "}
          to inspect the knowledge graph behind this record.
        </p>
      </main>
    </>
  );
}

/** Says where the knowledge came from, which is not the same question as how much of it there was. */
function steeredByHint(learned: Clause[]): string {
  if (learned.length === 0) return "the brief alone";
  const foreign = learned.filter((c) => c.originProjectId && c.originProjectTitle).length;
  if (foreign === learned.length) return `${learned.length} inherited from other productions`;
  if (foreign > 0) return `${learned.length} learned, ${foreign} of them inherited`;
  return `${learned.length} learned on earlier attempts`;
}

function Row({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 border-t border-basalt-800 pt-6">
      <SectionTitle hint={hint}>{title}</SectionTitle>
      {children}
    </section>
  );
}

function Pair({ label, value, wrap }: { label: string; value: string; wrap?: boolean }) {
  return (
    <div className="flex gap-3">
      <dt className="w-28 shrink-0 uppercase tracking-wider text-bone-500">{label}</dt>
      <dd className={`min-w-0 text-bone-300 ${wrap ? "break-all" : "truncate"}`}>{value}</dd>
    </div>
  );
}
