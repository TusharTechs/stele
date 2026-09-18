"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card } from "@/components/ui";

/**
 * The brief.
 *
 * Criteria are separate lines rather than one paragraph because they are the rubric the reviewer
 * scores against, one verdict per line — the field's shape has to match what the graph will hold.
 * The estimate under the button is shown before anything is spent, since a video render is the one
 * step here with a cost worth knowing in advance.
 */

const PLACEHOLDER = {
  goal: "A calm, premium product film for a matte-black ceramic coffee cup on pale concrete.",
  criteria: "The cup is unmistakably the hero of every frame\nThe look stays consistent across all shots",
  avoid: "on-screen text or logos\nharsh contrast",
  style: "Soft directional window light, cool neutral palette, shallow depth of field.",
};

/** From the live meter: ltx-2.5 fast bills per second of output, and keyframes and reviews are cents. */
const USD_PER_VIDEO_SECOND = 0.0945;
const USD_PER_SHOT_OVERHEAD = 0.02;

export function NewProjectForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [shotCount, setShotCount] = useState(3);
  const [shotSeconds, setShotSeconds] = useState(6);

  const estimate = shotCount * (shotSeconds * USD_PER_VIDEO_SECOND + USD_PER_SHOT_OVERHEAD);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);

    const form = new FormData(event.currentTarget);
    const lines = (name: string) =>
      String(form.get(name) ?? "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

    const criteria = lines("criteria").map((body, index) => ({ index, body }));
    if (criteria.length === 0) {
      setError("Give at least one success criterion — it is what the reviewer scores against.");
      setBusy(false);
      return;
    }

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          agentLabel: String(form.get("agentLabel") || "studio-a"),
          brief: {
            goal: String(form.get("goal") ?? ""),
            audience: String(form.get("audience") ?? ""),
            styleNote: String(form.get("styleNote") ?? ""),
            criteria,
            avoid: lines("avoid"),
            shotCount,
            shotSeconds,
            targetScore: Number(form.get("targetScore") ?? 8),
            groundingUrl: String(form.get("groundingUrl") || "") || undefined,
            narration: form.get("narration") === "on",
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
    <Card className="p-4">
      <form onSubmit={submit} className="grid gap-4">
        <Field label="The film" hint="One or two sentences.">
          <textarea name="goal" required rows={3} defaultValue={PLACEHOLDER.goal} className={INPUT} />
        </Field>

        <Field label="Success criteria" hint="One per line. The reviewer scores each separately.">
          <textarea name="criteria" required rows={3} defaultValue={PLACEHOLDER.criteria} className={INPUT} />
        </Field>

        <Field label="House style" optional>
          <textarea name="styleNote" rows={2} defaultValue={PLACEHOLDER.style} className={INPUT} />
        </Field>

        <Field label="Avoid" hint="One per line." optional>
          <textarea name="avoid" rows={2} defaultValue={PLACEHOLDER.avoid} className={INPUT} />
        </Field>

        <Field label="Audience" optional>
          <input name="audience" defaultValue="Design-literate buyers browsing a homepage" className={INPUT} />
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Shots">
            <input
              name="shotCount"
              type="number"
              min={1}
              max={8}
              value={shotCount}
              onChange={(e) => setShotCount(Number(e.target.value))}
              className={INPUT}
            />
          </Field>
          <Field label="Seconds" hint="each">
            <select
              value={shotSeconds}
              onChange={(e) => setShotSeconds(Number(e.target.value))}
              className={INPUT}
            >
              {/* The video capability accepts these values and no others. */}
              {[6, 8, 10, 12].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Target" hint="/10">
            <input name="targetScore" type="number" min={1} max={10} defaultValue={8} className={INPUT} />
          </Field>
        </div>

        <Field label="Ground in a page" hint="https only — its claims are kept as a source." optional>
          <input name="groundingUrl" type="url" placeholder="https://…" className={INPUT} />
        </Field>

        <div className="grid gap-2">
          <label className="flex items-center gap-2 text-sm text-bone-400">
            <input type="checkbox" name="narration" className="accent-verdigris-500" />
            Narrate it
          </label>
          <Field label="Studio identity" hint="Whose knowledge this becomes in the shared graph.">
            <input name="agentLabel" defaultValue="studio-a" className={INPUT} />
          </Field>
        </div>

        {error ? (
          <p className="rounded border border-terracotta-500/40 bg-terracotta-900 px-3 py-2 text-sm text-terracotta-400">
            {error}
          </p>
        ) : null}

        <div>
          <Button type="submit" variant="primary" disabled={busy} className="w-full">
            {busy ? "Building the canon…" : "Create production"}
          </Button>
          <p className="mt-2 text-center font-mono text-[11px] text-bone-500">
            ~${estimate.toFixed(2)} of network spend per attempt · nothing renders until you press Run
          </p>
        </div>
      </form>
    </Card>
  );
}

const INPUT =
  "w-full rounded border border-basalt-700 bg-basalt-950 px-2.5 py-1.5 text-sm text-bone-50 outline-none transition-colors placeholder:text-bone-500 focus:border-verdigris-500/60";

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
