"use client";

import { useState } from "react";
import type { Lesson, Project } from "@/core/schemas";
import { Badge, Button, Card, Empty, SectionTitle } from "@/components/ui";

/**
 * The canon, and the human who governs it.
 *
 * Everything the loop learns arrives here as a proposal and steers nothing until someone accepts it.
 * That is the deliberate difference from a self-feeding memory: a model's confidence in a wrong
 * observation looks exactly like its confidence in a right one, and an unreviewed mistake that
 * enters the canon corrupts every later attempt while looking like progress.
 *
 * Each decision is written back to the graph with its author, so the record shows not just what the
 * project knows but who let it in.
 */
export function CanonTab({
  project,
  offers,
  onChanged,
  onRefresh,
}: {
  project: Project;
  offers: Lesson[];
  onChanged: (project: Project) => void;
  onRefresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<string>();

  async function curate(action: string, lesson: Lesson, body?: string) {
    setBusy(lesson.id);
    try {
      const response = await fetch(`/api/projects/${project.id}/lessons`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          lessonId: lesson.id,
          body,
          lesson: action === "adopt" ? lesson : undefined,
        }),
      });
      const data = await response.json();
      if (response.ok) {
        onChanged(data.project);
        if (action === "adopt") await onRefresh();
      }
    } finally {
      setBusy(undefined);
    }
  }

  const proposed = project.lessons.filter((l) => l.status === "proposed");
  const active = project.lessons.filter((l) => l.status === "accepted" || l.status === "pinned");
  const rejected = project.lessons.filter((l) => l.status === "rejected");

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <div className="grid gap-8">
        <section>
          <SectionTitle hint={proposed.length ? "nothing here steers a render yet" : undefined}>
            Proposed · awaiting your decision
          </SectionTitle>
          {proposed.length === 0 ? (
            <Empty>Nothing waiting. New lessons appear here after each attempt.</Empty>
          ) : (
            <ul className="grid gap-2">
              {proposed.map((lesson) => (
                <LessonRow
                  key={lesson.id}
                  lesson={lesson}
                  project={project}
                  busy={busy === lesson.id}
                  actions={["accept", "pin", "reject"]}
                  onAction={curate}
                />
              ))}
            </ul>
          )}
        </section>

        <section>
          <SectionTitle hint={`${active.length} steering every render`}>In the canon</SectionTitle>
          {active.length === 0 ? (
            <Empty>Nothing accepted yet, so renders compile from the brief and its constraints alone.</Empty>
          ) : (
            <ul className="grid gap-2">
              {active.map((lesson) => (
                <LessonRow
                  key={lesson.id}
                  lesson={lesson}
                  project={project}
                  busy={busy === lesson.id}
                  actions={lesson.status === "pinned" ? ["reject"] : ["pin", "reject"]}
                  onAction={curate}
                />
              ))}
            </ul>
          )}
        </section>

        {rejected.length > 0 ? (
          <section>
            <SectionTitle hint="kept in the record, excluded from every prompt">Rejected</SectionTitle>
            <ul className="grid gap-2">
              {rejected.map((lesson) => (
                <LessonRow
                  key={lesson.id}
                  lesson={lesson}
                  project={project}
                  busy={busy === lesson.id}
                  actions={["accept"]}
                  onAction={curate}
                  muted
                />
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      <div className="grid content-start gap-8">
        <Inherited offers={offers} busy={busy} onAdopt={(lesson) => curate("adopt", lesson)} />
        <Constraints project={project} />
      </div>
    </div>
  );
}

/**
 * Knowledge from other projects, offered here.
 *
 * This is the part a local file cannot do honestly. These rows came back from a SPARQL query across
 * project boundaries in shared memory, and each carries the project and studio that proved it — so
 * what arrives is attributable knowledge rather than an anonymous string. Adopting copies it in as a
 * proposal, still subject to the same review as anything learned here.
 */
function Inherited({
  offers,
  busy,
  onAdopt,
}: {
  offers: Lesson[];
  busy?: string;
  onAdopt: (lesson: Lesson) => void;
}) {
  return (
    <section>
      <SectionTitle hint="via shared working memory">From other productions</SectionTitle>
      {offers.length === 0 ? (
        <Empty>
          No other project has shared knowledge that applies here yet. Run a second production and its
          accepted lessons will surface in this panel.
        </Empty>
      ) : (
        <ul className="grid gap-2">
          {offers.map((lesson) => (
            <Card key={lesson.id} className="border-bronze-400/25 bg-bronze-900/30 p-3">
              <p className="text-sm text-bone-200">{lesson.body}</p>
              <p className="mt-1.5 font-mono text-[10px] uppercase tracking-wider text-bronze-300">
                {lesson.originProjectTitle ?? lesson.originProjectId ?? "another project"}
                {lesson.originAgent ? ` · ${lesson.originAgent}` : ""} · attempt {lesson.learnedFromAttempt}
              </p>
              <Button
                variant="secondary"
                className="mt-2"
                disabled={busy === lesson.id}
                onClick={() => onAdopt(lesson)}
              >
                Adopt as a proposal
              </Button>
            </Card>
          ))}
        </ul>
      )}
    </section>
  );
}

function Constraints({ project }: { project: Project }) {
  return (
    <section>
      <SectionTitle hint="decomposed from your brief">Constraints</SectionTitle>
      <ul className="grid gap-1.5">
        {project.constraints.map((constraint) => (
          <li key={constraint.id} className="flex items-start gap-2 text-sm">
            <span className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-bone-500">
              {constraint.kind}
            </span>
            <span className="min-w-0 text-bone-300">{constraint.body}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function LessonRow({
  lesson,
  project,
  busy,
  actions,
  onAction,
  muted,
}: {
  lesson: Lesson;
  project: Project;
  busy: boolean;
  actions: string[];
  onAction: (action: string, lesson: Lesson, body?: string) => void;
  muted?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(lesson.body);

  const criterion =
    lesson.criterionIndex !== undefined
      ? project.brief.criteria.find((c) => c.index === lesson.criterionIndex)
      : undefined;

  return (
    <Card className={`p-3 ${muted ? "opacity-50" : ""}`}>
      {editing ? (
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={2}
          className="w-full rounded border border-basalt-700 bg-basalt-950 px-2.5 py-1.5 text-sm text-bone-50 focus:border-verdigris-500/60"
        />
      ) : (
        <p className="text-sm text-bone-200">{lesson.body}</p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Badge tone={lesson.kind === "knownFailure" ? "failed" : "knowledge"}>{lesson.kind}</Badge>
        {lesson.status === "pinned" ? <Badge tone="verified">pinned</Badge> : null}
        <span className="font-mono text-[10px] uppercase tracking-wider text-bone-500">
          attempt {lesson.learnedFromAttempt} · confidence {lesson.confidence.toFixed(2)}
          {lesson.curatedBy ? ` · by ${lesson.curatedBy}` : ""}
        </span>

        <span className="ml-auto flex gap-1">
          {editing ? (
            <>
              <Button
                variant="primary"
                disabled={busy || draft.trim().length < 4}
                onClick={() => {
                  onAction("edit", lesson, draft.trim());
                  setEditing(false);
                }}
              >
                Save
              </Button>
              <Button variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              {actions.includes("accept") ? (
                <Button variant="primary" disabled={busy} onClick={() => onAction("accept", lesson)}>
                  Accept
                </Button>
              ) : null}
              {actions.includes("pin") ? (
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => onAction("pin", lesson)}
                  title="Pin: accepted, and never dropped when the prompt is trimmed."
                >
                  Pin
                </Button>
              ) : null}
              <Button variant="ghost" disabled={busy} onClick={() => setEditing(true)}>
                Edit
              </Button>
              {actions.includes("reject") ? (
                <Button variant="danger" disabled={busy} onClick={() => onAction("reject", lesson)}>
                  Reject
                </Button>
              ) : null}
            </>
          )}
        </span>
      </div>

      {criterion ? (
        <p className="mt-1.5 font-mono text-[10px] text-bone-500">fixes “{criterion.body}”</p>
      ) : null}
    </Card>
  );
}
