"use client";

import { useState } from "react";
import type { Check, VerifyResult } from "@/core/verify";
import { Badge, Button, Card, SectionTitle } from "@/components/ui";

/**
 * The check, run in front of you.
 *
 * Deliberately not run on page load. A verification that happens automatically and always says "yes"
 * is wallpaper; one you press, wait for, and watch report per-check is a claim being tested. The
 * reproduction line under each result matters as much as the result: it is how someone repeats the
 * check without this page.
 */
export function VerifyPanel({ projectId }: { projectId: string }) {
  const [result, setResult] = useState<VerifyResult>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function verify() {
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/projects/${projectId}/verify`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) setError(data.error ?? "Verification could not run.");
      else setResult(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-8 border-t border-basalt-800 pt-6">
      <SectionTitle
        hint={
          result
            ? `${result.passed} passed · ${result.failed} failed · ${result.unavailable} not applicable`
            : "nothing is checked until you ask"
        }
      >
        Verify this record
      </SectionTitle>

      {!result ? (
        <p className="mb-3 text-sm text-bone-400">
          Each check re-derives something from scratch and compares it to what was recorded. Nothing
          below trusts the process that produced this page.
        </p>
      ) : null}

      <Button variant={result ? "secondary" : "primary"} disabled={busy} onClick={verify}>
        {busy ? "Checking…" : result ? "Check again" : "Run the checks"}
      </Button>

      {error ? (
        <p className="mt-3 rounded border border-terracotta-500/40 bg-terracotta-900 px-3 py-2 text-sm text-terracotta-400">
          {error}
        </p>
      ) : null}

      {result ? (
        <ul className="mt-4 grid gap-2">
          {result.checks.map((check) => (
            <CheckRow key={check.id} check={check} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

const TONE = {
  pass: { badge: "verified", mark: "✓", colour: "text-verdigris-400" },
  fail: { badge: "failed", mark: "✕", colour: "text-terracotta-400" },
  unavailable: { badge: "neutral", mark: "·", colour: "text-bone-500" },
} as const;

function CheckRow({ check }: { check: Check }) {
  const tone = TONE[check.status];
  return (
    <Card className="p-3">
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 font-mono ${tone.colour}`}>{tone.mark}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-bone-50">{check.label}</span>
            <Badge tone={tone.badge}>{check.status === "unavailable" ? "n/a" : check.status}</Badge>
          </div>
          <p className="mt-1 text-[13px] text-bone-300">{check.detail}</p>
          <p className="mt-1 text-[12px] text-bone-500">{check.proves}</p>
          {check.reproduce ? (
            <pre className="mt-2 overflow-x-auto rounded border border-basalt-800 bg-basalt-950 px-2.5 py-2 font-mono text-[10px] leading-relaxed text-bone-400">
              {check.reproduce}
            </pre>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
