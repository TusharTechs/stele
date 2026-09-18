"use client";

import { useState } from "react";
import { Button, Card, Money, SectionTitle } from "@/components/ui";
import { FilmClip } from "@/components/FilmClip";

/**
 * Put the record on the picture.
 *
 * The stamped file sits beside the original rather than replacing it, because the integrity check on
 * this page hashes the cut that was rendered. Overwriting it would make the film carry its record
 * and fail its own verification in the same breath.
 */
export function StampPanel({ projectId, existing }: { projectId: string; existing?: string }) {
  const [stamped, setStamped] = useState(existing);
  const [cost, setCost] = useState<number>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function stamp() {
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/projects/${projectId}/stamp`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) setError(data.error ?? "The stamp could not be applied.");
      else {
        setStamped(data.stampedUrl);
        setCost(data.costUSD);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-8 border-t border-basalt-800 pt-6">
      <SectionTitle hint={stamped ? "the address is on the picture" : "hyperframes-lower-third"}>
        Carry the record on the film
      </SectionTitle>

      <p className="mb-3 max-w-2xl text-sm text-bone-400">
        A provenance record nobody can find from the file itself is a weak version of the claim. This
        burns the address onto the cut, so wherever the video ends up, the way back to its record
        travels with it.
      </p>

      <Button variant={stamped ? "secondary" : "primary"} disabled={busy} onClick={stamp}>
        {busy ? "Burning it on…" : stamped ? "Stamp again" : "Stamp the cut"}
      </Button>

      {error ? (
        <p className="mt-3 rounded border border-terracotta-500/40 bg-terracotta-900 px-3 py-2 text-sm text-terracotta-400">
          {error}
        </p>
      ) : null}

      {stamped ? (
        <Card className="mt-4 overflow-hidden">
          <FilmClip src={stamped} label="the stamped copy" />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-basalt-800 px-4 py-2.5 font-mono text-[10px] text-bone-500">
            <span>stamped copy, kept beside the original</span>
            {cost !== undefined ? <span><Money usd={cost} /></span> : null}
            <a
              href={stamped}
              download
              className="ml-auto text-verdigris-400 transition-colors hover:text-verdigris-500"
            >
              download
            </a>
          </div>
        </Card>
      ) : null}
    </section>
  );
}
