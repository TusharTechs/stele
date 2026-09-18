"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ClipRef } from "@/core/showcase";

/**
 * Two cuts of the same brief, played together.
 *
 * The first version handed each clip to the browser's own player. That puts two sets of operating
 * system furniture in the middle of the argument, complete with a scrub bar, a mute toggle and an
 * overflow menu offering to download the file, and it leaves both clips sitting on frame zero until
 * someone presses play twice. A comparison nobody watches proves nothing.
 *
 * So the pair is driven from here: one transport, both clips, started from the same frame when the
 * section comes into view. Watching them out of step would be worse than not showing them, since
 * half the difference a reader is being asked to see is timing.
 */
export function ProofPair({
  before,
  after,
  beforeLabel,
  afterLabel,
}: {
  before: ClipRef;
  after: ClipRef;
  beforeLabel: string;
  afterLabel: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const left = useRef<HTMLVideoElement>(null);
  const right = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  const restart = useCallback(() => {
    for (const el of [left.current, right.current]) {
      if (!el) continue;
      el.currentTime = 0;
      void el.play().catch(() => undefined);
    }
  }, []);

  const toggle = useCallback(() => {
    const running = !left.current?.paused;
    for (const el of [left.current, right.current]) {
      if (!el) continue;
      if (running) el.pause();
      else void el.play().catch(() => undefined);
    }
  }, []);

  /**
   * The label follows the element, not the intent.
   *
   * Setting `playing` at the point of asking looked equivalent and was not: a browser is free to
   * refuse or suspend playback, and when it does, the transport goes on offering to pause a clip
   * that is sitting still. Reading it back off the left video means the button can only ever say
   * what is actually happening, including when something else stops it.
   */
  useEffect(() => {
    const el = left.current;
    if (!el) return;

    const sync = () => setPlaying(!el.paused);
    sync();
    for (const event of ["play", "pause", "ended"]) el.addEventListener(event, sync);
    return () => {
      for (const event of ["play", "pause", "ended"]) el.removeEventListener(event, sync);
    };
  }, []);

  // Start once, when the pair is actually on screen. Autoplaying from the top of the page would
  // have both clips halfway through their loop by the time anyone scrolled to them.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        restart();
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [restart]);

  return (
    <div ref={wrap}>
      <div className="grid gap-4 md:grid-cols-2 md:gap-5">
        <Panel
          videoRef={left}
          clip={before}
          label={beforeLabel}
          playing={playing}
          onToggle={toggle}
        />
        <Panel
          videoRef={right}
          clip={after}
          label={afterLabel}
          playing={playing}
          onToggle={toggle}
          highlight
        />
      </div>

      <div className="mt-5 flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={toggle}
          className="inline-flex items-center gap-2 rounded border border-basalt-700 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-bone-400 transition-colors hover:border-basalt-600 hover:text-bone-50"
        >
          <Glyph playing={playing} />
          {playing ? "Pause both" : "Play both"}
        </button>
        <button
          type="button"
          onClick={restart}
          className="rounded px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-bone-500 transition-colors hover:text-bone-50"
        >
          From the start
        </button>
      </div>
    </div>
  );
}

function Panel({
  videoRef,
  clip,
  label,
  playing,
  onToggle,
  highlight = false,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  clip: ClipRef;
  label: string;
  playing: boolean;
  onToggle: () => void;
  highlight?: boolean;
}) {
  return (
    <figure>
      <div
        className={`group relative overflow-hidden rounded-lg border bg-black ${
          highlight ? "border-verdigris-500/40" : "border-basalt-800"
        }`}
      >
        <video
          ref={videoRef}
          src={clip.url}
          // The shot's own keyframe. Without it the panel is a black rectangle until the first
          // frame decodes, which on a slow connection is the whole argument of the page missing.
          poster={clip.posterUrl}
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden
          className="aspect-video w-full object-cover"
        />

        <button
          type="button"
          onClick={onToggle}
          aria-label={`${playing ? "Pause" : "Play"} both cuts`}
          className="absolute inset-0 flex items-center justify-center bg-basalt-950/0 transition-colors hover:bg-basalt-950/20"
        >
          <span
            className={`flex h-11 w-11 items-center justify-center rounded-full border border-bone-50/25 bg-basalt-950/60 text-bone-50 backdrop-blur-sm transition-opacity ${
              playing ? "opacity-0 group-hover:opacity-100" : "opacity-100"
            }`}
          >
            <Glyph playing={playing} large />
          </span>
        </button>
      </div>

      <figcaption className="mt-3 flex items-baseline justify-between gap-3">
        <span className="font-mono text-[11px] uppercase tracking-wider text-bone-500">{label}</span>
        <span
          className={`shrink-0 font-mono text-sm tabular-nums ${
            highlight ? "text-bone-200" : "text-bone-400"
          }`}
        >
          {clip.score}
          <span className="text-bone-500">/10</span>
        </span>
      </figcaption>
      <p className="mt-1.5 text-[13px] leading-snug text-bone-500">{clip.summary}</p>
    </figure>
  );
}

function Glyph({ playing, large = false }: { playing: boolean; large?: boolean }) {
  const size = large ? "h-4 w-4" : "h-2.5 w-2.5";
  return (
    <svg viewBox="0 0 12 12" className={size} fill="currentColor" aria-hidden>
      {playing ? <path d="M3 2h2.2v8H3zM6.8 2H9v8H6.8z" /> : <path d="M3.4 2.2 10 6l-6.6 3.8z" />}
    </svg>
  );
}
