"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card } from "@/components/ui";
import { Select } from "@/components/Select";
import { READ_ONLY_REASON } from "@/core/deploy";

/**
 * The brief.
 *
 * This is where a production is defined, so the form has one job beyond collecting text: to make the
 * shape of a brief obvious before anything is spent. Two fields used to be textareas with "one per
 * line" written beside them, which is a contract stated in a hint and contradicted by the control.
 * Nothing on screen told you whether you had written two criteria or one long sentence, and criteria
 * are not a detail here: the reviewer returns one verdict per criterion, the graph stores them
 * individually, and the record shows which ones a render fixed.
 *
 * So criteria are numbered rows, the same numbers the verdicts come back under, and avoid rules are
 * chips, because they are short phrases rather than sentences. The form is grouped into what the
 * film is, how it will be judged, and what the render costs, and every value is controlled so a
 * starter brief can fill the whole thing at once.
 */

/** From the live meter: ltx-2.5 fast bills per second of output, and keyframes and reviews are cents. */
const USD_PER_VIDEO_SECOND = 0.0945;
const USD_PER_SHOT_OVERHEAD = 0.02;

/** The video capability accepts these durations and no others, so they are offered rather than typed. */
const SECONDS = [6, 8, 10, 12];

interface Draft {
  goal: string;
  criteria: string[];
  styleNote: string;
  avoid: string[];
  audience: string;
  shotCount: number;
  shotSeconds: number;
  targetScore: number;
  narration: boolean;
  groundingUrl: string;
  agentLabel: string;
}

const BLANK: Draft = {
  goal: "",
  criteria: [""],
  styleNote: "",
  avoid: [],
  audience: "",
  shotCount: 3,
  shotSeconds: 6,
  targetScore: 8,
  narration: false,
  groundingUrl: "",
  agentLabel: "studio-a",
};

/**
 * Complete briefs, not filler.
 *
 * An empty studio is a blank page, and a blank page is the worst thing to hand someone who has two
 * minutes to work out what a project does. Each of these is runnable as it stands and shows the
 * shape of a good brief: a concrete subject, criteria that can actually be judged by watching, and
 * a look that constrains without describing every frame.
 */
const STARTERS: Array<{ name: string; draft: Partial<Draft> }> = [
  {
    name: "Ceramic cup",
    draft: {
      goal: "A calm, premium product film for a matte-black ceramic coffee cup on pale concrete.",
      criteria: [
        "The cup is unmistakably the hero of every frame",
        "The look stays consistent across all shots",
      ],
      styleNote: "Soft directional window light, cool neutral palette, shallow depth of field.",
      avoid: ["on-screen text or logos", "harsh contrast"],
      audience: "Design-literate buyers browsing a homepage",
    },
  },
  {
    name: "Desk clock",
    draft: {
      goal: "A three-shot product film for a brushed-brass desk clock on a dark walnut surface.",
      criteria: [
        "The clock face is legible and in focus in at least one shot",
        "Framing varies meaningfully between shots",
        "The brass reads as warm metal, not gold plastic",
      ],
      styleNote: "Low warm key from the left, deep falloff into shadow, shallow depth of field.",
      avoid: ["on-screen text", "visible reflections of the camera"],
      audience: "Buyers comparing desk accessories",
    },
  },
  {
    name: "Stoneware teapot",
    draft: {
      goal: "A three-shot teaser for a hand-thrown stoneware teapot, glazed deep indigo, on a bare plaster shelf.",
      criteria: [
        "The glaze colour stays identical across all shots",
        "The teapot is the singular focus of every frame",
        "The mood is quiet and unhurried",
      ],
      styleNote: "Soft north light, deep falloff into shadow, no visible light source.",
      avoid: ["steam or pouring", "cluttered background"],
      audience: "People who buy one good object rather than five cheap ones",
    },
  },
];

export interface CanonOption {
  id: string;
  title: string;
  rules: number;
  constraints: number;
}

export function NewProjectForm({
  canons = [],
  readOnly = false,
}: {
  canons?: CanonOption[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>({ ...BLANK, ...STARTERS[0].draft });
  const [forkFrom, setForkFrom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const forked = canons.find((c) => c.id === forkFrom);
  const filled = draft.criteria.map((c) => c.trim()).filter(Boolean);
  const estimate = draft.shotCount * (draft.shotSeconds * USD_PER_VIDEO_SECOND + USD_PER_SHOT_OVERHEAD);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);

    if (filled.length === 0) {
      setError("Give at least one success criterion. It is what the reviewer scores against.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          agentLabel: draft.agentLabel || "studio-a",
          forkFrom: forkFrom || undefined,
          brief: {
            goal: draft.goal,
            audience: draft.audience,
            styleNote: draft.styleNote,
            criteria: filled.map((body, index) => ({ index, body })),
            avoid: draft.avoid,
            shotCount: draft.shotCount,
            shotSeconds: draft.shotSeconds,
            targetScore: draft.targetScore,
            groundingUrl: draft.groundingUrl || undefined,
            narration: draft.narration,
            music: false,
          },
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not create the project.");
      router.push(`/studio/${data.project.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusy(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <form onSubmit={submit}>
        <div className="flex flex-wrap items-center gap-2 border-b border-basalt-800 px-4 py-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-bone-500">
            start from
          </span>
          {STARTERS.map((starter) => (
            <button
              key={starter.name}
              type="button"
              onClick={() => setDraft({ ...BLANK, ...starter.draft })}
              className="rounded-full border border-basalt-700 px-2.5 py-1 text-[11px] text-bone-400 transition-colors hover:border-verdigris-500/50 hover:text-verdigris-400"
            >
              {starter.name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setDraft({ ...BLANK })}
            className="ml-auto font-mono text-[10px] uppercase tracking-wider text-bone-500 transition-colors hover:text-bone-200"
          >
            clear
          </button>
        </div>

        <div className="grid gap-5 p-4">
          <Section title="The film">
            <Field label="What it is" hint="One or two sentences.">
              <textarea
                required
                rows={3}
                value={draft.goal}
                onChange={(e) => set("goal", e.target.value)}
                placeholder="A calm, premium product film for…"
                className={INPUT}
              />
            </Field>

            <Field label="House style" optional>
              <textarea
                rows={2}
                value={draft.styleNote}
                onChange={(e) => set("styleNote", e.target.value)}
                placeholder="Soft directional window light, cool neutral palette…"
                className={INPUT}
              />
            </Field>

            <Field label="Audience" optional>
              <input
                value={draft.audience}
                onChange={(e) => set("audience", e.target.value)}
                placeholder="Who this is for"
                className={INPUT}
              />
            </Field>
          </Section>

          <Section
            title="How it gets judged"
            note="A model watches the finished cut and returns one verdict per criterion. These are that list."
          >
            <CriteriaList value={draft.criteria} onChange={(v) => set("criteria", v)} />

            <Field label="Avoid" hint="Enter to add." optional>
              <ChipInput
                value={draft.avoid}
                onChange={(v) => set("avoid", v)}
                placeholder="on-screen text, harsh contrast…"
              />
            </Field>

            <Field label="Target score" hint={`${draft.targetScore} of 10`}>
              <Stepper value={draft.targetScore} min={1} max={10} onChange={(v) => set("targetScore", v)} />
            </Field>
          </Section>

          <Section title="The render">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Shots">
                <Stepper value={draft.shotCount} min={1} max={8} onChange={(v) => set("shotCount", v)} />
              </Field>
              <Field label="Seconds each">
                <div className="flex gap-1">
                  {SECONDS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => set("shotSeconds", n)}
                      className={`flex-1 rounded border py-1.5 font-mono text-[12px] transition-colors ${
                        draft.shotSeconds === n
                          ? "border-verdigris-500/60 bg-verdigris-900 text-verdigris-400"
                          : "border-basalt-700 text-bone-400 hover:border-basalt-600 hover:text-bone-200"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </Field>
            </div>

            <Field label="Ground in a page" hint="https only" optional>
              <input
                type="url"
                value={draft.groundingUrl}
                onChange={(e) => set("groundingUrl", e.target.value)}
                placeholder="https://…"
                className={INPUT}
              />
              <span className="text-[10px] leading-snug text-bone-500">
                Its claims are extracted and kept as a source on the record.
              </span>
            </Field>

            <label className="flex cursor-pointer items-center gap-2 text-sm text-bone-400">
              <input
                type="checkbox"
                checked={draft.narration}
                onChange={(e) => set("narration", e.target.checked)}
                className="accent-verdigris-500"
              />
              Narrate it
            </label>
          </Section>

          <Section
            title="Provenance"
            note="Whose knowledge this becomes, and whose it starts from."
          >
            <Field label="Studio identity">
              <input
                value={draft.agentLabel}
                onChange={(e) => set("agentLabel", e.target.value)}
                className={INPUT}
              />
            </Field>

            <Field label="Start from a canon" optional>
              <Select
                value={forkFrom}
                onChange={setForkFrom}
                ariaLabel="Start from a canon"
                placeholder="A blank canon"
                options={[
                  { value: "", label: "A blank canon" },
                  ...canons.map((c) => ({
                    value: c.id,
                    label: c.title,
                    hint: `${c.rules} rules · ${c.constraints} constraints`,
                  })),
                ]}
              />
            </Field>

            {forked ? (
              <p className="border-l-2 border-bronze-400/40 pl-2.5 text-[12px] leading-snug text-bronze-300">
                This production begins with {forked.rules} rule{forked.rules === 1 ? "" : "s"} and{" "}
                {forked.constraints} constraint{forked.constraints === 1 ? "" : "s"} from {forked.title},
                already accepted. That is a house style, carried across.
              </p>
            ) : null}
          </Section>

          {error ? (
            <p className="rounded border border-terracotta-500/40 bg-terracotta-900 px-3 py-2 text-sm text-terracotta-400">
              {error}
            </p>
          ) : null}

          {readOnly ? (
            <p className="rounded border border-bronze-400/30 bg-bronze-900/40 px-3 py-2 text-[13px] leading-relaxed text-bronze-300">
              {READ_ONLY_REASON}
            </p>
          ) : null}

          <div>
            <Button
              type="submit"
              variant="primary"
              disabled={busy || readOnly}
              title={readOnly ? READ_ONLY_REASON : undefined}
              className="w-full"
            >
              {busy ? "Building the canon…" : forked ? "Create, starting from that canon" : "Create production"}
            </Button>
            <p className="mt-2 text-center font-mono text-[11px] text-bone-500">
              ~${estimate.toFixed(2)} per attempt · {filled.length} criteri
              {filled.length === 1 ? "on" : "a"} · nothing renders until you press Run
            </p>
          </div>
        </div>
      </form>
    </Card>
  );
}

const INPUT =
  "w-full rounded border border-basalt-700 bg-basalt-950 px-2.5 py-1.5 text-sm text-bone-50 transition-colors placeholder:text-bone-500 focus:border-verdigris-500/60";

/**
 * The criteria, numbered the way the verdicts come back.
 *
 * One row per criterion, carrying the index the reviewer will score under, so the connection between
 * what you wrote here and what comes back on the record is visible rather than explained.
 */
function CriteriaList({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const replace = (i: number, text: string) => onChange(value.map((v, j) => (j === i ? text : v)));
  const add = () => onChange([...value, ""]);
  // Never below one row: an empty list reads as a broken control rather than as an empty field.
  const remove = (i: number) => onChange(value.length > 1 ? value.filter((_, j) => j !== i) : [""]);

  return (
    <div className="grid gap-1.5">
      <span className="flex items-baseline gap-2">
        <span className="font-mono text-[11px] uppercase tracking-wider text-bone-500">
          Success criteria
        </span>
        <span className="ml-auto font-mono text-[10px] text-bone-500">
          {value.filter((v) => v.trim()).length} scored separately
        </span>
      </span>

      <ul className="grid gap-1.5">
        {value.map((criterion, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="mt-2 w-5 shrink-0 font-mono text-[11px] tabular-nums text-verdigris-400">
              {String(i + 1).padStart(2, "0")}
            </span>
            {/* A textarea, because a criterion is a sentence and this column is 400px wide. As a
                single-line input the text scrolled out of sight mid-word, which is a poor way to
                present the one field the reviewer scores against. Enter still adds the next row
                rather than a line break: one criterion is one statement. */}
            <textarea
              rows={2}
              value={criterion}
              onChange={(e) => replace(i, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
              placeholder="Something you could tell by watching"
              className={`${INPUT} resize-none leading-snug`}
            />
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label={`Remove criterion ${i + 1}`}
              className="mt-1 shrink-0 rounded p-1 text-bone-500 transition-colors hover:text-terracotta-400"
            >
              <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden>
                <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={add}
        className="justify-self-start font-mono text-[11px] uppercase tracking-wider text-bone-500 transition-colors hover:text-verdigris-400"
      >
        + add a criterion
      </button>
    </div>
  );
}

/** Short phrases, so they behave like tags rather than like prose. */
function ChipInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  function commit() {
    const text = draft.trim();
    if (!text || value.includes(text)) return setDraft("");
    onChange([...value, text]);
    setDraft("");
  }

  return (
    <div className="grid gap-1.5">
      {value.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((chip) => (
            <li key={chip}>
              <button
                type="button"
                onClick={() => onChange(value.filter((c) => c !== chip))}
                className="group flex items-center gap-1.5 rounded-full border border-terracotta-500/30 bg-terracotta-900/40 py-1 pr-2 pl-2.5 text-[12px] text-terracotta-400 transition-colors hover:border-terracotta-500/60"
              >
                {chip}
                <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 opacity-60 group-hover:opacity-100" aria-hidden>
                  <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                <span className="sr-only">Remove</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          }
          if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={commit}
        placeholder={placeholder}
        className={INPUT}
      />
    </div>
  );
}

/** A bounded number, without the browser's spinner and its invisible hit targets. */
function Stepper({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const step = (by: number) => onChange(Math.min(max, Math.max(min, value + by)));

  return (
    <div className="flex items-center rounded border border-basalt-700">
      <StepButton label="Decrease" disabled={value <= min} onClick={() => step(-1)}>
        <path d="M3 6h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </StepButton>
      <span className="flex-1 text-center font-mono text-sm tabular-nums text-bone-50">{value}</span>
      <StepButton label="Increase" disabled={value >= max} onClick={() => step(1)}>
        <path d="M6 3v6M3 6h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </StepButton>
    </div>
  );
}

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="px-2.5 py-1.5 text-bone-400 transition-colors hover:text-bone-50 disabled:text-basalt-600"
    >
      <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden>
        {children}
      </svg>
    </button>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-3">
      <div className="border-b border-basalt-800 pb-2">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-bone-400">{title}</h3>
        {note ? <p className="mt-1 text-[11px] leading-snug text-bone-500">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  hint,
  optional,
  children,
}: {
  label: string;
  hint?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="flex items-baseline gap-2">
        <span className="font-mono text-[11px] uppercase tracking-wider text-bone-500">{label}</span>
        {optional ? <span className="text-[10px] text-bone-500">optional</span> : null}
        {hint ? <span className="ml-auto text-[10px] text-bone-500">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}
