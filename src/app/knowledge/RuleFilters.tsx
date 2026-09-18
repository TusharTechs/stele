"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { LibraryRule } from "@/core/library";
import { Badge, Card, Empty } from "@/components/ui";

type StatusFilter = "all" | "steering" | "proposed" | "rejected" | "travelled";

/**
 * The library, filtered.
 *
 * Rejected rules stay listed rather than disappearing. What a studio decided *not* to keep is part
 * of its house style, and a canon that only shows its wins teaches nobody anything.
 */
export function RuleFilters({
  rules,
  projects,
}: {
  rules: LibraryRule[];
  projects: Array<{ id: string; title: string; agentLabel: string }>;
}) {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [project, setProject] = useState("");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rules.filter((rule) => {
      if (project && rule.projectId !== project) return false;
      if (needle && !rule.body.toLowerCase().includes(needle)) return false;
      if (status === "steering") return rule.status === "accepted" || rule.status === "pinned";
      if (status === "proposed") return rule.status === "proposed";
      if (status === "rejected") return rule.status === "rejected";
      if (status === "travelled") return Boolean(rule.originProjectId && rule.originProjectId !== rule.projectId);
      return true;
    });
  }, [rules, status, project, query]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(
          [
            ["all", "All"],
            ["steering", "Steering renders"],
            ["proposed", "Awaiting review"],
            ["travelled", "Crossed a project"],
            ["rejected", "Rejected"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setStatus(key)}
            className={`rounded border px-2.5 py-1 text-[12px] transition-colors ${
              status === key
                ? "border-verdigris-500/50 bg-verdigris-900 text-verdigris-400"
                : "border-basalt-700 bg-basalt-850 text-bone-400 hover:text-bone-200"
            }`}
          >
            {label}
          </button>
        ))}

        <select
          value={project}
          onChange={(e) => setProject(e.target.value)}
          className="rounded border border-basalt-700 bg-basalt-950 px-2 py-1 text-[12px] text-bone-300"
        >
          <option value="">Every production</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the rules…"
          className="ml-auto min-w-40 flex-1 rounded border border-basalt-700 bg-basalt-950 px-2.5 py-1 text-[12px] text-bone-200 placeholder:text-bone-500 sm:flex-none sm:basis-56"
        />
      </div>

      {filtered.length === 0 ? (
        <Empty>Nothing matches that.</Empty>
      ) : (
        <ul className="grid gap-2">
          {filtered.map((rule) => (
            <Card as="li" key={rule.id} className="p-3.5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="min-w-0 flex-1 text-sm text-bone-100">{rule.body}</p>
                <div className="flex shrink-0 items-center gap-2">
                  {rule.timesUsed > 0 ? (
                    <Badge tone="verified">
                      steered {rule.timesUsed} render{rule.timesUsed === 1 ? "" : "s"}
                    </Badge>
                  ) : null}
                  <Badge tone={statusTone(rule.status)}>{rule.status}</Badge>
                </div>
              </div>

              <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-bone-500">
                <Link href={`/studio/${rule.projectId}`} className="hover:text-bone-200">
                  {rule.projectTitle}
                </Link>
                {" · "}
                {rule.agentLabel} · attempt {rule.learnedFromAttempt} · {rule.kind} ·{" "}
                confidence {rule.confidence.toFixed(2)}
                {rule.curatedBy ? ` · let in by ${rule.curatedBy}` : ""}
              </p>

              {rule.originProjectId && rule.originProjectId !== rule.projectId ? (
                <p className="mt-1 text-[11px] text-bronze-300">
                  Proved by {rule.originProjectTitle ?? "another production"} and adopted here.
                </p>
              ) : null}
              {rule.fixes ? (
                <p className="mt-1 text-[11px] text-bone-500">
                  Written to fix “<span className="text-bone-400">{rule.fixes}</span>”
                </p>
              ) : null}
            </Card>
          ))}
        </ul>
      )}
    </>
  );
}

function statusTone(status: LibraryRule["status"]) {
  if (status === "pinned" || status === "accepted") return "verified" as const;
  if (status === "rejected") return "failed" as const;
  return "knowledge" as const;
}
