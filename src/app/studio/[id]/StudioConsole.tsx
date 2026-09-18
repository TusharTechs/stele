"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Lesson, Project } from "@/core/schemas";
import type { PipelineEvent } from "@/core/pipeline";
import type { DkgMode } from "@/dkg/client";
import { Badge, Button, Card, Money, Score } from "@/components/ui";
import { ProductionTab } from "./ProductionTab";
import { CanonTab } from "./CanonTab";
import { GraphTab } from "./GraphTab";
import { RunLog } from "./RunLog";

/**
 * The console.
 *
 * Holds the project, keeps it in step with a run in progress, and decides which tab is showing. The
 * live view comes from server-sent events rather than polling, and the authoritative project is
 * re-fetched whenever a run finishes — the event stream is for watching, the fetched project is for
 * truth, and mixing the two would eventually show a score that no longer matched the record.
 */

export type Tab = "production" | "canon" | "graph";

export function StudioConsole({
  initialProject,
  initialOffers,
  initiallyRunning,
  dkgMode,
}: {
  initialProject: Project;
  initialOffers: Lesson[];
  initiallyRunning: boolean;
  dkgMode: DkgMode;
}) {
  const [project, setProject] = useState(initialProject);
  const [offers, setOffers] = useState(initialOffers);
  const [running, setRunning] = useState(initiallyRunning);
  const [events, setEvents] = useState<PipelineEvent[]>([]);
  const [tab, setTab] = useState<Tab>("production");
  const [notice, setNotice] = useState<{ tone: "ok" | "bad"; text: string }>();
  const [selectedAttempt, setSelectedAttempt] = useState<number | undefined>(
    initialProject.runs.filter((r) => r.stage === "COMPLETE").at(-1)?.attempt
  );

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/projects/${project.id}`, { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    setProject(data.project);
    setOffers(data.offers ?? []);
    setRunning(Boolean(data.running));
    const newest = (data.project as Project).runs.filter((r) => r.stage === "COMPLETE").at(-1);
    if (newest) setSelectedAttempt(newest.attempt);
  }, [project.id]);

  // One subscription per run. Re-subscribing on every event would reopen the stream constantly and
  // replay the backlog each time, so the effect depends only on whether a run is live.
  useEffect(() => {
    if (!running) return;
    const source = new EventSource(`/api/projects/${project.id}/events`);

    source.onmessage = (message) => {
      const event = JSON.parse(message.data) as PipelineEvent | { type: "ping" | "idle" };
      if (event.type === "ping") return;
      if (event.type === "idle") {
        setRunning(false);
        source.close();
        return;
      }

      setEvents((current) => [...current, event as PipelineEvent]);
      if (event.type === "done" || event.type === "error") {
        setRunning(false);
        source.close();
        void refresh();
      }
    };

    source.onerror = () => {
      source.close();
      setRunning(false);
      void refresh();
    };

    return () => source.close();
  }, [running, project.id, refresh]);

  const start = useCallback(
    async (withholdMemory: boolean) => {
      setEvents([]);
      setNotice(undefined);
      const response = await fetch(`/api/projects/${project.id}/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ withholdMemory }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setNotice({ tone: "bad", text: data.error ?? "Could not start the run." });
        return;
      }
      setRunning(true);
      setTab("production");
    },
    [project.id]
  );

  const scored = useMemo(() => project.runs.filter((run) => run.review), [project]);
  const activeLessons = project.lessons.filter((l) => l.status === "accepted" || l.status === "pinned");
  const proposed = project.lessons.filter((l) => l.status === "proposed");
  const totalSpend = project.runs.reduce((sum, run) => sum + run.costUSD, 0);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Header
        project={project}
        scored={scored}
        totalSpend={totalSpend}
        activeCount={activeLessons.length}
        running={running}
        dkgMode={dkgMode}
        onRun={start}
        onSealed={(text, tone) => setNotice({ tone, text })}
        onRefresh={refresh}
      />

      {notice ? (
        <p
          className={`mt-4 rounded border px-3 py-2 text-sm ${
            notice.tone === "ok"
              ? "border-verdigris-500/40 bg-verdigris-900 text-verdigris-400"
              : "border-terracotta-500/40 bg-terracotta-900 text-terracotta-400"
          }`}
        >
          {notice.text}
        </p>
      ) : null}

      {running || events.length > 0 ? <RunLog events={events} running={running} /> : null}

      <nav className="mt-8 flex gap-1 border-b border-basalt-800">
        {(
          [
            ["production", "Production"],
            ["canon", `Canon${proposed.length ? ` · ${proposed.length} to review` : ""}`],
            ["graph", "Knowledge graph"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
              tab === key
                ? "border-verdigris-500 text-bone-50"
                : "border-transparent text-bone-500 hover:text-bone-200"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="py-6">
        {tab === "production" ? (
          <ProductionTab
            project={project}
            selectedAttempt={selectedAttempt}
            onSelectAttempt={setSelectedAttempt}
          />
        ) : null}
        {tab === "canon" ? (
          <CanonTab project={project} offers={offers} onChanged={setProject} onRefresh={refresh} />
        ) : null}
        {tab === "graph" ? <GraphTab project={project} /> : null}
      </div>
    </main>
  );
}

function Header({
  project,
  scored,
  totalSpend,
  activeCount,
  running,
  dkgMode,
  onRun,
  onSealed,
  onRefresh,
}: {
  project: Project;
  scored: Project["runs"];
  totalSpend: number;
  activeCount: number;
  running: boolean;
  dkgMode: DkgMode;
  onRun: (withholdMemory: boolean) => void;
  onSealed: (text: string, tone: "ok" | "bad") => void;
  onRefresh: () => Promise<void>;
}) {
  const [sealing, setSealing] = useState(false);
  const latest = scored.at(-1);
  const first = scored[0];
  const delta = latest && first && latest !== first ? latest.review!.score - first.review!.score : undefined;

  async function seal() {
    setSealing(true);
    try {
      const response = await fetch(`/api/projects/${project.id}/seal`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) onSealed(data.error ?? "Could not seal.", "bad");
      else {
        onSealed(data.seal?.ual ? `Sealed. UAL ${data.seal.ual}` : "Sealed to the network.", "ok");
        await onRefresh();
      }
    } finally {
      setSealing(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="display-sm text-xl text-bone-50">{project.title}</h1>
            <Badge tone="knowledge">canon v{project.canonVersion}</Badge>
            {activeCount > 0 ? <Badge tone="knowledge">{activeCount} lessons steering</Badge> : null}
            {project.seals.length > 0 ? <Badge tone="verified">sealed</Badge> : null}
          </div>
          <p className="mt-2 max-w-2xl text-sm text-bone-400">{project.brief.goal}</p>
          {project.note ? (
            <p className="mt-2.5 max-w-2xl border-l-2 border-bronze-400/40 pl-3 text-[13px] leading-snug text-bronze-300">
              {project.note}
            </p>
          ) : null}

          <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[11px] text-bone-500">
            <Stat label="attempts" value={String(project.runs.length)} />
            <Stat label="criteria" value={String(project.brief.criteria.length)} />
            <Stat label="constraints" value={String(project.constraints.length)} />
            <Stat label="spent" value={<Money usd={totalSpend} />} />
            <Stat label="studio" value={project.agentLabel} />
          </dl>
        </div>

        <div className="flex flex-col items-end gap-3">
          {latest?.review ? (
            <div className="text-right">
              <Score value={latest.review.score} target={project.brief.targetScore} />
              {delta !== undefined && delta !== 0 ? (
                <p
                  className={`mt-1 font-mono text-[11px] ${delta > 0 ? "text-verdigris-400" : "text-terracotta-400"}`}
                >
                  {delta > 0 ? "+" : ""}
                  {delta.toFixed(Math.abs(delta) % 1 ? 1 : 0)} since the first attempt
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="primary" disabled={running} onClick={() => onRun(false)}>
              {running ? "Running…" : project.runs.length === 0 ? "Run first attempt" : "Run next attempt"}
            </Button>
            {/* The control condition. Only offered once there is knowledge to withhold — before
                that it would be identical to an ordinary run and would prove nothing. */}
            <Button
              variant="secondary"
              disabled={running || activeCount === 0}
              onClick={() => onRun(true)}
              title={
                activeCount === 0
                  ? "Nothing in the canon yet, so a control run would be identical to a normal one."
                  : "Run the same brief with every learned lesson withheld, to measure what the canon is worth."
              }
            >
              Run control
            </Button>
            <Button
              variant="ghost"
              disabled={sealing || running || scored.length === 0 || dkgMode !== "network"}
              onClick={seal}
              title={
                dkgMode === "network"
                  ? "Publish this production's record to Verifiable Memory and mint a UAL."
                  : `This instance runs on ${dkgMode === "edge" ? "an edge node" : "a local RDF store"}. Set STELE_DKG=network to seal.`
              }
            >
              {sealing ? "Sealing…" : "Seal"}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="uppercase tracking-wider text-bone-500">{label}</dt>
      <dd className="mt-0.5 text-bone-200">{value}</dd>
    </div>
  );
}
