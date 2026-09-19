"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Select } from "@/components/Select";
import { READ_ONLY_REASON } from "@/core/deploy";

/**
 * The composer.
 *
 * Writing a brief is the one creative act in this product, and it used to happen in a 400px sidebar
 * holding twelve stacked controls. No amount of styling fixes that: a narrow column of labelled
 * boxes reads as a settings panel whatever the boxes look like, and it gave the most important field
 * on the page exactly as much room as "audience".
 *
 * So the brief takes the full width and the page is ordered the way the work is: make something,
 * then look at what you have made. Inside, the film itself is the largest thing on screen, the
 * rubric sits beneath it because that is what the reviewer will actually score, and everything that
 * shapes the render is a strip along the bottom next to the price of pressing the button.
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
 * An empty studio is a blank page, and a blank page is the worst thing to hand someone with two
 * minutes to work out what a project does. Each of these runs as it stands and shows the shape of a
 * good brief: a concrete subject, criteria you could settle by watching, and a look that constrains
 * without describing every frame.
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
      avoid: ["on-screen text", "reflections of the camera"],
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

export function Composer({
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
  const runtime = draft.shotCount * draft.shotSeconds;
  const typed = useCycledPlaceholder(STARTERS.map((s) => s.draft.goal!), draft.goal.length === 0);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);

    if (!draft.goal.trim()) return setError("Say what the film is. One or two sentences is enough.");
    if (filled.length === 0) {
      return setError("Give at least one success criterion. It is what the reviewer scores against.");
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
    <form
      onSubmit={submit}
      className="carved overflow-hidden rounded-xl border border-basalt-800 bg-basalt-900"
    >
      <div className="grid lg:grid-cols-[1.35fr_1fr]">
        <div className="border-b border-basalt-800 p-6 lg:border-r lg:border-b-0 lg:p-8">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="display text-2xl text-bone-50">What are we making?</h2>
            <button
              type="button"
              onClick={() => setDraft({ ...BLANK, ...STARTERS[Math.floor(Math.random() * STARTERS.length)].draft })}
              className="ml-auto font-mono text-[10px] uppercase tracking-[0.16em] text-bone-500 transition-colors hover:text-verdigris-400"
            >
              surprise me
            </button>
          </div>

          <textarea
            required
            rows={3}
            value={draft.goal}
            onChange={(e) => set("goal", e.target.value)}
            placeholder={typed}
            className="mt-4 w-full resize-none rounded-lg border border-basalt-700 bg-basalt-950 p-4 text-[17px] leading-relaxed text-bone-50 transition-colors placeholder:text-bone-500 focus:border-verdigris-500/60"
          />

          <div className="mt-3 flex flex-wrap gap-1.5">
            {STARTERS.map((starter) => (
              <button
                key={starter.name}
                type="button"
                onClick={() => setDraft({ ...BLANK, ...starter.draft })}
                className="rounded-full border border-basalt-700 px-3 py-1 text-[11px] text-bone-400 transition-colors hover:border-verdigris-500/50 hover:text-verdigris-400"
              >
                {starter.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setDraft({ ...BLANK })}
              className="rounded-full px-3 py-1 text-[11px] text-bone-500 transition-colors hover:text-bone-200"
            >
              clear
            </button>
          </div>

          <div className="mt-8">
            <div className="flex items-baseline gap-2">
              <h3 className="display-sm text-base text-bone-100">How it gets judged</h3>
              <span className="ml-auto font-mono text-[10px] text-bone-500">
                {filled.length} scored separately
              </span>
            </div>
            <p className="mt-1 text-[12px] leading-snug text-bone-500">
              A model watches the finished cut and returns one verdict per line below. A shot that
              fails goes back and gets rendered again with the reason attached.
            </p>

            <CriteriaList value={draft.criteria} onChange={(v) => set("criteria", v)} />
          </div>

          {/* The column ran empty below two criteria, and the gap is the moment someone is deciding
              whether to press the button. So it holds the answer to what pressing it does. */}
          <ol className="mt-8 grid gap-2.5 border-t border-basalt-800 pt-5">
            {[
              ["Reads first", "A SPARQL query returns your constraints and every rule you have accepted. Each row becomes one clause of the prompt, and keeps a link back to the row."],
              ["Renders, then argues", `${draft.shotCount} shot${draft.shotCount === 1 ? "" : "s"} go out, a model watches each one against ${filled.length || "your"} criteri${filled.length === 1 ? "on" : "a"}, and anything it rejects is rendered again with the reason attached.`],
              ["Waits for you", "What it learned is written down as proposed rules. None of them steer another render until you accept them."],
            ].map(([title, body]) => (
              <li key={title} className="flex gap-3">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-verdigris-500" aria-hidden />
                <p className="text-[12px] leading-relaxed text-bone-500">
                  <span className="text-bone-300">{title}.</span> {body}
                </p>
              </li>
            ))}
          </ol>
        </div>

        <div className="grid gap-5 p-6 lg:p-8">
          <Field label="House style" optional>
            <textarea
              rows={2}
              value={draft.styleNote}
              onChange={(e) => set("styleNote", e.target.value)}
              placeholder="Soft directional window light, cool neutral palette…"
              className={`${INPUT} resize-none`}
            />
          </Field>

          <Field label="Never show" hint="Enter to add" optional>
            <ChipInput value={draft.avoid} onChange={(v) => set("avoid", v)} placeholder="on-screen text…" />
          </Field>

          <Field label="Audience" optional>
            <input
              value={draft.audience}
              onChange={(e) => set("audience", e.target.value)}
              placeholder="Who this is for"
              className={INPUT}
            />
          </Field>

          <Field label="Ground in a page" hint="https only" optional>
            <input
              type="url"
              value={draft.groundingUrl}
              onChange={(e) => set("groundingUrl", e.target.value)}
              placeholder="https://…"
              className={INPUT}
            />
          </Field>

          <div className="grid gap-3 border-t border-basalt-800 pt-5">
            <Field label="Studio identity" hint="whose knowledge this becomes">
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
                Begins with {forked.rules} rule{forked.rules === 1 ? "" : "s"} and {forked.constraints}{" "}
                constraint{forked.constraints === 1 ? "" : "s"} from {forked.title}, already accepted.
                A house style, carried across.
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="border-t border-basalt-800 bg-basalt-950/60 px-6 py-4 lg:px-8">
        <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
          <Dial label="Shots">
            <Stepper value={draft.shotCount} min={1} max={8} onChange={(v) => set("shotCount", v)} />
          </Dial>

          <Dial label="Seconds each">
            <div className="flex gap-1">
              {SECONDS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => set("shotSeconds", n)}
                  className={`w-9 rounded border py-1.5 font-mono text-[12px] transition-colors ${
                    draft.shotSeconds === n
                      ? "border-verdigris-500/60 bg-verdigris-900 text-verdigris-400"
                      : "border-basalt-700 text-bone-400 hover:border-basalt-600 hover:text-bone-200"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </Dial>

          <Dial label="Target">
            <Stepper value={draft.targetScore} min={1} max={10} onChange={(v) => set("targetScore", v)} />
          </Dial>

          <Dial label="Voice">
            <button
              type="button"
              onClick={() => set("narration", !draft.narration)}
              aria-pressed={draft.narration}
              className={`rounded border px-3 py-1.5 text-[12px] transition-colors ${
                draft.narration
                  ? "border-verdigris-500/60 bg-verdigris-900 text-verdigris-400"
                  : "border-basalt-700 text-bone-400 hover:border-basalt-600 hover:text-bone-200"
              }`}
            >
              {draft.narration ? "Narrated" : "Silent"}
            </button>
          </Dial>

          <div className="ml-auto flex items-end gap-5">
            <dl className="text-right font-mono text-[11px] text-bone-500">
              <div className="flex items-baseline justify-end gap-2">
                <dt>runtime</dt>
                <dd className="tabular-nums text-bone-200">{runtime}s</dd>
              </div>
              <div className="mt-0.5 flex items-baseline justify-end gap-2">
                <dt>per attempt</dt>
                <dd className="tabular-nums text-bone-200">~${estimate.toFixed(2)}</dd>
              </div>
            </dl>

            <button
              type="submit"
              disabled={busy || readOnly}
              title={readOnly ? READ_ONLY_REASON : undefined}
              className="rounded-lg bg-verdigris-500 px-6 py-2.5 font-medium text-basalt-950 transition-colors hover:bg-verdigris-400 disabled:cursor-not-allowed disabled:bg-basalt-700 disabled:text-bone-500"
            >
              {busy ? "Building the canon…" : forked ? "Create from that canon" : "Create production"}
            </button>
          </div>
        </div>

        {error ? (
          <p className="mt-3 rounded border border-terracotta-500/40 bg-terracotta-900 px-3 py-2 text-sm text-terracotta-400">
            {error}
          </p>
        ) : null}

        {readOnly ? (
          <p className="mt-3 rounded border border-bronze-400/30 bg-bronze-900/40 px-3 py-2 text-[13px] leading-relaxed text-bronze-300">
            {READ_ONLY_REASON}
          </p>
        ) : (
          <p className="mt-3 font-mono text-[10px] text-bone-500">
            Nothing renders until you press Run inside the production.
          </p>
        )}
      </div>
    </form>
  );
}

const INPUT =
  "w-full rounded border border-basalt-700 bg-basalt-950 px-2.5 py-1.5 text-sm text-bone-50 transition-colors placeholder:text-bone-500 focus:border-verdigris-500/60";

/**
 * A placeholder that cycles through real briefs.
 *
 * Not decoration: an empty field is the hardest part of this page, and showing complete examples in
 * it demonstrates the shape of a good brief without spending a line of instructional copy. It stops
 * the moment anyone types, and it is only ever a placeholder, so nothing here can be submitted by
 * accident.
 */
function useCycledPlaceholder(options: string[], active: boolean): string {
  const [index, setIndex] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    if (!active) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    timer.current = setInterval(() => setIndex((i) => (i + 1) % options.length), 4200);
    return () => clearInterval(timer.current);
  }, [active, options.length]);

  return options[index];
}

/**
 * The criteria, numbered the way the verdicts come back.
 *
 * One row per criterion, carrying the index the reviewer will score under, so the connection between
 * what is written here and what comes back on the record is visible rather than explained. Textareas
 * rather than inputs, because a criterion is a sentence and an input scrolls it out of sight.
 */
function CriteriaList({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const replace = (i: number, text: string) => onChange(value.map((v, j) => (j === i ? text : v)));
  const add = () => onChange([...value, ""]);
  // Never below one row: an empty list reads as a broken control rather than as an empty field.
  const remove = (i: number) => onChange(value.length > 1 ? value.filter((_, j) => j !== i) : [""]);

  return (
    <>
      <ol className="mt-4 grid gap-2">
        {value.map((criterion, i) => (
          <li key={i} className="group flex items-start gap-3">
            <span className="mt-2.5 w-5 shrink-0 font-mono text-[11px] tabular-nums text-verdigris-400">
              {String(i + 1).padStart(2, "0")}
            </span>
            <textarea
              rows={1}
              value={criterion}
              onChange={(e) => replace(i, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
              placeholder="Something you could settle by watching"
              className={`${INPUT} resize-none py-2 leading-snug`}
            />
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label={`Remove criterion ${i + 1}`}
              className="mt-1.5 shrink-0 rounded p-1.5 text-transparent transition-colors group-hover:text-bone-500 hover:!text-terracotta-400 focus-visible:text-bone-500"
            >
              <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden>
                <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          </li>
        ))}
      </ol>

      <button
        type="button"
        onClick={add}
        className="mt-2.5 ml-8 font-mono text-[11px] uppercase tracking-wider text-bone-500 transition-colors hover:text-verdigris-400"
      >
        + add a criterion
      </button>
    </>
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
    <div className="flex w-[104px] items-center rounded border border-basalt-700">
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

/** One control in the bottom strip, labelled above rather than beside. */
function Dial({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-bone-500">{label}</span>
      {children}
    </div>
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
