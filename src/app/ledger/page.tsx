import Link from "next/link";
import { buildLedger } from "@/core/library";
import { SiteHeader } from "@/components/SiteHeader";
import { Badge, Card, Empty, Money, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * What the network charged, across everything.
 *
 * Every figure is the network's own `cost_usd_estimated` on a recorded call, not a local price
 * table. Failures are counted rather than hidden: a provider that accepted a job and then failed
 * still billed for it, and a ledger that quietly drops those is not a ledger.
 */
export default async function LedgerPage() {
  const ledger = await buildLedger();

  if (ledger.totalCalls === 0) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
          <Empty>Nothing has been spent yet. Run a production and every call lands here.</Empty>
        </main>
      </>
    );
  }

  const successRate = ((ledger.totalCalls - ledger.failedCalls) / ledger.totalCalls) * 100;
  const maxUSD = Math.max(...ledger.byCapability.map((c) => c.usd), 0.0001);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-bone-500">Ledger</p>
        <h1 className="display mt-2 text-3xl text-bone-50">
          What the network charged
        </h1>
        <p className="mt-3 max-w-2xl text-bone-400">
          Metered by Livepeer itself on every call, successful or not. Nothing here is estimated from
          a price list.
        </p>

        <dl className="mt-7 flex flex-wrap gap-x-8 gap-y-3 font-mono text-[11px]">
          <Stat label="total"><Money usd={ledger.totalUSD} /></Stat>
          <Stat label="calls">{ledger.totalCalls}</Stat>
          <Stat label="succeeded">{successRate.toFixed(1)}%</Stat>
          {ledger.failedCalls > 0 ? (
            <Stat label="failed and still billed" tone="failed">{ledger.failedCalls}</Stat>
          ) : null}
          {ledger.wastedUSD > 0.005 ? (
            <Stat label="on attempts never scored" tone="failed"><Money usd={ledger.wastedUSD} /></Stat>
          ) : null}
        </dl>

        <section className="mt-9">
          <SectionTitle hint="most expensive first">By capability</SectionTitle>
          <ul className="grid gap-1.5">
            {ledger.byCapability.map((c) => (
              <li key={c.capability}>
                <div className="flex items-baseline justify-between gap-3 font-mono text-[11px]">
                  <span className="truncate text-bone-200">{c.capability}</span>
                  <span className="shrink-0 text-bone-500">
                    ×{c.calls}
                    {c.failures > 0 ? <span className="text-terracotta-400"> · {c.failures} failed</span> : null}
                    {" · "}
                    {(c.totalMs / c.calls / 1000).toFixed(1)}s avg · <Money usd={c.usd} />
                  </span>
                </div>
                {/* The bar is the point: one capability dominates, and it is worth seeing which. */}
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-basalt-850">
                  <div
                    className={c.failures > 0 ? "h-full bg-bronze-400" : "h-full bg-verdigris-500"}
                    style={{ width: `${Math.max(1.5, (c.usd / maxUSD) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-9">
          <SectionTitle hint={`${ledger.byProject.length} productions`}>By production</SectionTitle>
          <ul className="grid gap-1.5">
            {ledger.byProject.map((p) => (
              <li key={p.id} className="flex items-baseline justify-between gap-3 font-mono text-[11px]">
                <Link href={`/studio/${p.id}`} className="truncate text-bone-200 hover:text-bone-50">
                  {p.title}
                </Link>
                <span className="shrink-0 text-bone-500">
                  {p.attempts} attempt{p.attempts === 1 ? "" : "s"} · {p.calls} calls ·{" "}
                  <Money usd={p.usd} />
                </span>
              </li>
            ))}
          </ul>
        </section>

        {ledger.warnings.length > 0 ? (
          <section className="mt-9">
            <SectionTitle hint="kept rather than swallowed">Parameters the network dropped</SectionTitle>
            <p className="mb-3 max-w-2xl text-sm text-bone-400">
              When a capability ignores something we sent, it says so. Those warnings are recorded
              instead of discarded, because a silently dropped instruction is how you end up debugging
              a prompt that was never delivered.
            </p>
            <ul className="grid gap-1.5">
              {ledger.warnings.map((w, i) => (
                <Card as="li" key={i} className="border-bronze-400/25 bg-bronze-900/30 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[13px] text-bone-200">{w.message}</p>
                    <Badge tone="knowledge">×{w.count}</Badge>
                  </div>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-bronze-300">
                    {w.capability}
                  </p>
                </Card>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </>
  );
}

function Stat({ label, children, tone }: { label: string; children: React.ReactNode; tone?: "failed" }) {
  return (
    <div>
      <dt className="uppercase tracking-wider text-bone-500">{label}</dt>
      <dd className={`mt-1 text-xl tabular-nums ${tone === "failed" ? "text-terracotta-400" : "text-bone-200"}`}>
        {children}
      </dd>
    </div>
  );
}
