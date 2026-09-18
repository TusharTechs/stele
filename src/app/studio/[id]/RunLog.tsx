"use client";

import { useEffect, useRef } from "react";
import type { PipelineEvent } from "@/core/pipeline";
import { Card, Money } from "@/components/ui";

const STAGES = [
  "GROUNDING",
  "COMPILING",
  "PLANNING",
  "RENDERING",
  "ASSEMBLING",
  "REVIEWING",
  "LEARNING",
] as const;

/**
 * What the run is doing, while it does it.
 *
 * A production is minutes of waiting with nothing on screen, and the temptation is a spinner. A
 * spinner tells you nothing about whether the compile found any knowledge, which shot is on its
 * second try, or what the reviewer said — which is most of what is interesting here. So the stages
 * are named, and every detail line the pipeline emits is kept.
 */
export function RunLog({ events, running }: { events: PipelineEvent[]; running: boolean }) {
  const scroller = useRef<HTMLDivElement>(null);

  const stageEvents = events.filter((e) => e.type === "stage");
  const current = stageEvents.at(-1);
  const currentIndex = current?.type === "stage" ? STAGES.indexOf(current.stage as (typeof STAGES)[number]) : -1;
  const cost = events.filter((e) => e.type === "cost").at(-1);
  const failed = events.some((e) => e.type === "error");

  useEffect(() => {
    // Pin to the newest line, which is where the interesting thing just happened.
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [events.length]);

  return (
    <Card className="mt-4 overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-basalt-800 px-4 py-2.5">
        {STAGES.map((stage, index) => {
          const done = currentIndex > index || (!running && !failed && currentIndex >= 0);
          const active = running && currentIndex === index;
          return (
            <span
              key={stage}
              className={`font-mono text-[10px] uppercase tracking-wider ${
                active ? "text-verdigris-400" : done ? "text-bone-400" : "text-bone-500"
              }`}
            >
              {active ? <span className="pulse-dot">▸ </span> : done ? "✓ " : "· "}
              {stage.toLowerCase()}
            </span>
          );
        })}
        <span className="ml-auto font-mono text-[11px] text-bone-500">
          {cost?.type === "cost" ? <Money usd={cost.totalUSD} /> : null}
        </span>
      </div>

      {running ? (
        <div className="relative h-0.5 overflow-hidden bg-basalt-800 sweep" aria-hidden />
      ) : null}

      <div ref={scroller} className="max-h-48 overflow-y-auto px-4 py-3 font-mono text-xs">
        {events.map((event, index) => (
          <Line key={index} event={event} />
        ))}
      </div>
    </Card>
  );
}

function Line({ event }: { event: PipelineEvent }) {
  if (event.type === "stage") {
    if (!event.detail) return null;
    return (
      <p className="text-bone-400">
        <span className="text-bone-500">{event.stage.toLowerCase()} </span>
        {event.detail}
      </p>
    );
  }

  if (event.type === "shot") {
    const tone =
      event.status === "passed"
        ? "text-verdigris-400"
        : event.status === "failed"
          ? "text-terracotta-400"
          : "text-bone-400";
    return (
      <p className={tone}>
        <span className="text-bone-500">shot {event.index} </span>
        {event.status}
        {event.detail ? ` · ${event.detail}` : ""}
      </p>
    );
  }

  if (event.type === "error") return <p className="text-terracotta-400">error · {event.message}</p>;
  if (event.type === "done") {
    return (
      <p className="text-verdigris-400">
        attempt {event.attempt} complete{event.score !== undefined ? ` · ${event.score}/10` : ""}
      </p>
    );
  }
  return null;
}
