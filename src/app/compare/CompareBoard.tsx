"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ComparableProject } from "@/core/library";
import { Badge, Card, Money, SectionTitle } from "@/components/ui";
import { Select } from "@/components/Select";

/**
 * The board.
 *
 * Defaults to the two most recent productions, because a comparison nobody has configured yet should
 * still show something true. The shared-rules count is the number that matters: it is the only place
 * in the product where you can see one film's knowledge sitting inside another's.
 */
export function CompareBoard({ projects }: { projects: ComparableProject[] }) {
  const [leftId, setLeftId] = useState(projects[1]?.id ?? projects[0].id);
  const [rightId, setRightId] = useState(projects[0].id);

  const left = projects.find((p) => p.id === leftId) ?? projects[0];
  const right = projects.find((p) => p.id === rightId) ?? projects[0];

  const shared = useMemo(() => {
    const a = new Set(left.ruleBodies);
    return right.ruleBodies.filter((b) => a.has(b));
  }, [left, right]);

  const sameProject = left.id === right.id;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Picker label="On the left" value={leftId} onChange={setLeftId} projects={projects} />
        <Picker label="On the right" value={rightId} onChange={setRightId} projects={projects} />
      </div>

      {sameProject ? (
        <p className="mt-4 rounded border border-bronze-400/30 bg-bronze-900/40 px-3 py-2 text-sm text-bronze-300">
          Both sides are the same production. Pick a different one to compare against.
        </p>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Side project={left} />
        <Side project={right} />
      </div>

      <Card className="mt-6 p-5">
        <SectionTitle hint={`${shared.length} of ${Math.max(left.steeringRules, right.steeringRules) || 0} rules in common`}>
          Shared knowledge
        </SectionTitle>

        {sameProject ? null : shared.length === 0 ? (
          <p className="text-sm text-bone-400">
            These two productions share no rules. Each learned its own way, which is what you would
            expect until one of them adopts from the other.
          </p>
        ) : (
          <>
            <p className="mb-3 text-sm text-bone-400">
              {right.inheritedRules > 0 || left.inheritedRules > 0
                ? "Knowledge has crossed between these productions. The rules below steer renders on both sides."
                : "Both arrived at these independently, which is its own kind of evidence."}
            </p>
            <ul className="grid gap-1.5">
              {shared.slice(0, 8).map((body, i) => (
                <li
                  key={i}
                  className="rounded border border-bronze-400/25 bg-bronze-900/30 px-3 py-2 text-[13px] text-bone-200"
                >
                  {body}
                </li>
              ))}
            </ul>
            {shared.length > 8 ? (
              <p className="mt-2 font-mono text-[11px] text-bone-500">and {shared.length - 8} more</p>
            ) : null}
          </>
        )}
      </Card>
    </>
  );
}

function Picker({
  label,
  value,
  onChange,
  projects,
}: {
  label: string;
  value: string;
  onChange: (id: string) => void;
  projects: ComparableProject[];
}) {
  return (
    <label className="grid gap-1.5">
      <span className="font-mono text-[11px] uppercase tracking-wider text-bone-500">{label}</span>
      <Select
        value={value}
        onChange={onChange}
        ariaLabel={label}
        options={projects.map((p) => ({
          value: p.id,
          label: p.title,
          hint: `${p.agentLabel} · ${p.attempts} attempt${p.attempts === 1 ? "" : "s"}`,
        }))}
      />
    </label>
  );
}

function Side({ project }: { project: ComparableProject }) {
  const gain =
    project.bestScore !== undefined && project.firstScore !== undefined
      ? project.bestScore - project.firstScore
      : undefined;

  return (
    <Card className="overflow-hidden">
      {project.cutUrl ? (
        <video
          src={project.cutUrl}
          poster={project.posterUrl}
          controls
          playsInline
          preload="metadata"
          className="aspect-video w-full bg-black"
        />
      ) : (
        <div className="flex aspect-video w-full items-center justify-center bg-basalt-850 text-sm text-bone-500">
          no finished cut
        </div>
      )}

      <div className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/studio/${project.id}`} className="font-medium text-bone-50 hover:underline">
            {project.title}
          </Link>
          <Badge tone="neutral">{project.agentLabel}</Badge>
          {project.inheritedRules > 0 ? (
            <Badge tone="knowledge">{project.inheritedRules} inherited</Badge>
          ) : null}
        </div>

        <p className="mt-1.5 line-clamp-2 text-sm text-bone-400">{project.goal}</p>
        {project.note ? (
          <p className="mt-2 border-l-2 border-bronze-400/40 pl-2.5 text-[12px] leading-snug text-bronze-300">
            {project.note}
          </p>
        ) : null}

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 font-mono text-[11px] sm:grid-cols-3">
          <Metric label="best score">
            {project.bestScore ?? "—"}
            <span className="text-bone-500">/{project.targetScore}</span>
            {gain ? (
              <span className={gain > 0 ? " text-verdigris-400" : " text-terracotta-400"}>
                {" "}
                {gain > 0 ? "+" : ""}
                {gain}
              </span>
            ) : null}
          </Metric>
          <Metric label="criteria met">
            {project.criteriaMet ?? "—"}
            <span className="text-bone-500">/{project.criteriaTotal}</span>
          </Metric>
          <Metric label="attempts">{project.attempts}</Metric>
          <Metric label="rules steering">{project.steeringRules}</Metric>
          <Metric label="spent">
            <Money usd={project.totalUSD} />
          </Metric>
        </dl>
      </div>
    </Card>
  );
}

function Metric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="uppercase tracking-wider text-bone-500">{label}</dt>
      <dd className="mt-0.5 tabular-nums text-bone-200">{children}</dd>
    </div>
  );
}
