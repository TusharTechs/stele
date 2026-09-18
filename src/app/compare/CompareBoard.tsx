"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ComparableProject, CompareRule } from "@/core/library";
import { Badge, Card, Money, SectionTitle } from "@/components/ui";
import { Select } from "@/components/Select";
import { FilmClip } from "@/components/FilmClip";

/**
 * The board.
 *
 * Defaults to the two most recent productions, because a comparison nobody has configured yet should
 * still show something true. The shared-rules count is the number that matters: it is the only place
 * in the product where you can see one film's knowledge sitting inside another's.
 */
export function CompareBoard({ projects }: { projects: ComparableProject[] }) {
  // The pair that actually shares something, rather than the two most recent.
  //
  // A comparison nobody has configured should still show something true, and "these two have
  // nothing in common" is true but is the least interesting true thing here: it is the same view a
  // folder of prompts would give. Opening on the pair with the most knowledge in common puts the
  // claim the page exists to make on screen before anyone touches a dropdown, and every other pair
  // is one selection away.
  const opening = useMemo(() => mostShared(projects), [projects]);
  const [leftId, setLeftId] = useState(opening.left);
  const [rightId, setRightId] = useState(opening.right);

  const left = projects.find((p) => p.id === leftId) ?? projects[0];
  const right = projects.find((p) => p.id === rightId) ?? projects[0];

  const rows = useMemo(() => crossing(left, right), [left, right]);
  const sharedCount = rows.filter((row) => row.onLeft && row.onRight).length;

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
        <SectionTitle
          hint={
            sameProject || rows.length === 0
              ? undefined
              : `${sharedCount} of ${rows.length} steer both`
          }
        >
          Shared knowledge
        </SectionTitle>

        {sameProject ? null : sharedCount === 0 ? (
          <p className="text-sm text-bone-400">
            These two productions share no rules. Each learned its own way, which is what you would
            expect until one of them adopts from the other.
          </p>
        ) : (
          <>
            <p className="mb-6 max-w-2xl text-sm text-bone-400">
              {right.inheritedRules > 0 || left.inheritedRules > 0
                ? "Knowledge has crossed between these productions. A filled node means the rule is steering renders on that side."
                : "Both arrived at these independently, which is its own kind of evidence. A filled node means the rule is steering renders on that side."}
            </p>
            <Crossing left={left} right={right} rows={rows} />
          </>
        )}
      </Card>
    </>
  );
}

/**
 * The pair of productions with the most rules in common, falling back to the two most recent.
 *
 * Compares on the folded key, the same way the board does, so the opening view and the panel below
 * it can never disagree about what counts as the same rule.
 */
function mostShared(projects: ComparableProject[]): { left: string; right: string } {
  let best = { left: projects[1]?.id ?? projects[0].id, right: projects[0].id, count: -1 };

  for (let i = 0; i < projects.length; i++) {
    for (let j = i + 1; j < projects.length; j++) {
      const keys = new Set(projects[i].rules.map((rule) => rule.key));
      const count = projects[j].rules.filter((rule) => keys.has(rule.key)).length;
      if (count > best.count) best = { left: projects[i].id, right: projects[j].id, count };
    }
  }

  return { left: best.left, right: best.right };
}

/**
 * Every rule either production is steering on, and which of them holds it.
 *
 * The panel used to print the intersection as a stack of boxes, which answered "what do they have
 * in common" and silently dropped everything that made them different. Two productions sharing
 * three rules out of four is a wholly different picture from three out of thirty, and the old panel
 * rendered both identically.
 *
 * Matching happens on the folded key and never on the body, so punctuation and capitalisation
 * cannot split one rule into two.
 */
interface CrossingRow extends CompareRule {
  onLeft: boolean;
  onRight: boolean;
}

function crossing(left: ComparableProject, right: ComparableProject): CrossingRow[] {
  const byKey = new Map<string, CrossingRow>();

  for (const [rules, side] of [
    [left.rules, "onLeft"],
    [right.rules, "onRight"],
  ] as const) {
    for (const rule of rules) {
      const existing = byKey.get(rule.key);
      if (existing) {
        existing[side] = true;
        // Whichever side recorded the provenance wins; a rule that travelled has it on one side only.
        existing.originProjectTitle ??= rule.originProjectTitle;
        continue;
      }
      byKey.set(rule.key, { ...rule, onLeft: side === "onLeft", onRight: side === "onRight" });
    }
  }

  // Shared first, because they are the claim. Then whatever is unique to the left, then the right,
  // so a reader tracks down one rail at a time rather than zig-zagging.
  return [...byKey.values()].sort((a, b) => rank(a) - rank(b));
}

function rank(row: CrossingRow): number {
  if (row.onLeft && row.onRight) return 0;
  return row.onLeft ? 1 : 2;
}

/**
 * Two rails and the rules strung between them.
 *
 * The same figure as the mark in the header: nodes, and the knowledge running between them. It
 * reads at a glance in a way a list of boxes cannot, since a row crossing both rails and a row
 * reaching only one are different shapes rather than different wording.
 */
function Crossing({
  left,
  right,
  rows,
}: {
  left: ComparableProject;
  right: ComparableProject;
  rows: CrossingRow[];
}) {
  const shown = rows.slice(0, 14);

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-6 font-mono text-[10px] uppercase tracking-[0.16em]">
        <span className="min-w-0 truncate text-bone-300">{left.title}</span>
        <span className="min-w-0 truncate text-right text-bone-300">{right.title}</span>
      </div>

      <div className="relative">
        {/* The rails, drawn behind the rows and stopped short of the first and last node so the
            line reads as spanning the rules rather than running off the card. */}
        <span aria-hidden className="absolute inset-y-4 left-[5px] w-px bg-basalt-700" />
        <span aria-hidden className="absolute inset-y-4 right-[5px] w-px bg-basalt-700" />

        <ul>
          {shown.map((row) => {
            const both = row.onLeft && row.onRight;
            return (
              <li
                key={row.key}
                className="relative grid grid-cols-[11px_1fr_11px] items-start gap-x-5 py-2.5"
              >
                {/* The crossing itself, drawn only in the gutters so it never runs under the type.
                    Two filled nodes already say "both", but the eye reads a line across a row far
                    faster than it compares two dots twenty inches apart. */}
                {both ? (
                  <>
                    <span aria-hidden className="absolute top-[20px] left-[11px] h-px w-5 bg-bronze-400/35" />
                    <span aria-hidden className="absolute top-[20px] right-[11px] h-px w-5 bg-bronze-400/35" />
                  </>
                ) : null}

                <Node on={row.onLeft} />

                <div className="min-w-0 text-center">
                  <p className={`text-[13px] leading-snug ${both ? "text-bone-100" : "text-bone-400"}`}>
                    {row.body}
                  </p>
                  {/* Also the text equivalent of the two nodes, which are decorative to a screen
                      reader. Provenance is appended rather than substituted: where a rule came from
                      and who is steering on it are two different facts and the panel owes both. */}
                  <Provenance row={row} left={left} right={right} />
                </div>

                <Node on={row.onRight} />
              </li>
            );
          })}
        </ul>
      </div>

      {rows.length > shown.length ? (
        <p className="mt-3 text-center font-mono text-[11px] text-bone-500">
          and {rows.length - shown.length} more
        </p>
      ) : null}
    </div>
  );
}

/**
 * Where a rule came from, said the shortest true way.
 *
 * Also the text equivalent of the two nodes, which are decorative to a screen reader. When the
 * production that proved a rule is one of the two on screen, the interesting fact is not its name
 * but the direction: this rule was learned there and is now steering here. When it came from a
 * third production, the name is the fact, since it is evidence of knowledge travelling further than
 * one hop.
 */
function Provenance({
  row,
  left,
  right,
}: {
  row: CrossingRow;
  left: ComparableProject;
  right: ComparableProject;
}) {
  const both = row.onLeft && row.onRight;
  const origin = row.originProjectTitle;
  const held = both ? "held by both" : `only on ${row.onLeft ? left.title : right.title}`;

  if (both && origin && (origin === left.title || origin === right.title)) {
    const to = origin === left.title ? right.title : left.title;
    return (
      <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-bronze-400">
        {/* The arrow is the whole sentence to a sighted reader and silence to a screen reader, so
            the reading is spelled out for one and hidden from the other. */}
        <span className="sr-only">Held by both. Proved on {origin}, now steering {to}.</span>
        <span aria-hidden>
          {origin} → {to}
        </span>
      </p>
    );
  }

  return (
    <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-bone-500">
      {held}
      {origin ? <span className="text-bronze-400"> · proved on {origin}</span> : null}
    </p>
  );
}

/** Filled where the rule steers that production, open where it does not. */
function Node({ on }: { on: boolean }) {
  return (
    <span className="mt-[5px] block h-[11px] w-[11px]" aria-hidden>
      <span
        className={`block h-full w-full rounded-full border ${
          on ? "border-bronze-400 bg-bronze-400" : "border-basalt-600 bg-basalt-900"
        }`}
      />
    </span>
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
        <FilmClip src={project.cutUrl} poster={project.posterUrl} label={project.title} />
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
