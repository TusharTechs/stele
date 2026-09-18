"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { GalleryItem } from "@/core/library";
import { Badge, Card, Empty } from "@/components/ui";

type Kind = "all" | "cut" | "shot" | "keyframe";

/**
 * The grid.
 *
 * Videos are posters until hovered, then they play muted. Sixty autoplaying clips would saturate the
 * connection and make the page unreadable; a still that moves when you point at it gives the same
 * sense of the work at a fraction of the cost.
 */
export function GalleryGrid({ items }: { items: GalleryItem[] }) {
  const [kind, setKind] = useState<Kind>("all");
  const [project, setProject] = useState("");

  const projects = useMemo(
    () => [...new Map(items.map((i) => [i.projectId, i.projectTitle])).entries()],
    [items]
  );

  const filtered = useMemo(
    () =>
      items.filter((i) => {
        if (project && i.projectId !== project) return false;
        if (kind === "cut") return i.kind === "cut" || i.kind === "stamped";
        if (kind === "shot") return i.kind === "shot";
        if (kind === "keyframe") return i.kind === "keyframe";
        return true;
      }),
    [items, kind, project]
  );

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(
          [
            ["all", "Everything"],
            ["cut", "Finished cuts"],
            ["shot", "Shots"],
            ["keyframe", "Keyframes"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setKind(key)}
            className={`rounded border px-2.5 py-1 text-[12px] transition-colors ${
              kind === key
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
          className="ml-auto rounded border border-basalt-700 bg-basalt-950 px-2 py-1 text-[12px] text-bone-300"
        >
          <option value="">Every production</option>
          {projects.map(([id, title]) => (
            <option key={id} value={id}>
              {title}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <Empty>Nothing matches that.</Empty>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((item) => (
            <GalleryTile key={item.id} item={item} />
          ))}
        </ul>
      )}
    </>
  );
}

function GalleryTile({ item }: { item: GalleryItem }) {
  const isVideo = item.kind !== "keyframe";
  const met = item.score !== undefined && item.score >= item.targetScore;

  return (
    <Card as="li" className="overflow-hidden transition-colors hover:border-basalt-700">
      <div className="relative aspect-video bg-basalt-850">
        {isVideo ? (
          <video
            src={item.url}
            poster={item.posterUrl}
            muted
            loop
            playsInline
            preload="none"
            className="h-full w-full object-cover"
            onMouseEnter={(e) => void e.currentTarget.play().catch(() => undefined)}
            onMouseLeave={(e) => {
              e.currentTarget.pause();
              e.currentTarget.currentTime = 0;
            }}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.url} alt={item.intent ?? "keyframe"} loading="lazy" className="h-full w-full object-cover" />
        )}

        <div className="absolute top-2 left-2 flex gap-1.5">
          {item.kind === "stamped" ? <Badge tone="verified">stamped</Badge> : null}
          {item.kind === "cut" ? <Badge tone="neutral">cut</Badge> : null}
          {item.derivedFromAnchor ? <Badge tone="knowledge">from anchor</Badge> : null}
        </div>

        {item.score !== undefined ? (
          <span
            className={`absolute right-2 bottom-2 rounded px-1.5 py-0.5 font-mono text-[11px] tabular-nums ${
              met ? "bg-verdigris-900 text-verdigris-400" : "bg-basalt-950/85 text-bone-300"
            }`}
          >
            {item.score}/10
          </span>
        ) : null}
      </div>

      <div className="p-3">
        <Link
          href={`/studio/${item.projectId}`}
          className="block truncate text-sm text-bone-100 hover:text-bone-50"
        >
          {item.projectTitle}
        </Link>
        <p className="mt-0.5 truncate text-[12px] text-bone-500">
          {item.intent ?? (item.kind === "stamped" ? "the cut, carrying its record" : "the finished cut")}
        </p>
        <p className="mt-1.5 font-mono text-[10px] uppercase tracking-wider text-bone-500">
          try {item.attempt}
          {item.shotIndex !== undefined ? ` · shot ${item.shotIndex}` : ""} · {item.capability}
        </p>
        <p className="mt-1 font-mono text-[10px] text-bone-500">
          {item.memoryWithheld ? (
            <span className="text-terracotta-400">memory withheld</span>
          ) : item.memoryClauseCount > 0 ? (
            <span className="text-bronze-300">{item.memoryClauseCount} learned clauses steered this</span>
          ) : (
            "no learned knowledge yet"
          )}
        </p>
      </div>
    </Card>
  );
}
