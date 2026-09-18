"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A finished cut, played on our terms.
 *
 * `controls` hands the middle of the page to the operating system: a scrub bar, a mute toggle and
 * an overflow menu offering to download the file, in a set of furniture that belongs to no other
 * element in the product. It is the same reason the dropdowns here are not native `<select>`s.
 *
 * What is kept is what a viewer actually needs on a page of stills: a poster so the panel is a
 * frame rather than a black rectangle, one click to start or stop, and nothing else.
 */
export function FilmClip({
  src,
  poster,
  className = "",
  label = "this cut",
}: {
  src: string;
  poster?: string;
  className?: string;
  label?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  // Read off the element rather than off intent. A browser is free to refuse or suspend playback,
  // and when it does, a button tracking its own state goes on offering to pause a still picture.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const sync = () => setPlaying(!el.paused);
    sync();
    for (const event of ["play", "pause", "ended"]) el.addEventListener(event, sync);
    return () => {
      for (const event of ["play", "pause", "ended"]) el.removeEventListener(event, sync);
    };
  }, []);

  function toggle() {
    const el = ref.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => undefined);
    else el.pause();
  }

  return (
    <div className={`group relative overflow-hidden bg-black ${className}`}>
      <video
        ref={ref}
        src={src}
        poster={poster}
        loop
        muted
        playsInline
        preload="metadata"
        aria-hidden
        className="aspect-video w-full object-cover"
      />

      <button
        type="button"
        onClick={toggle}
        aria-label={`${playing ? "Pause" : "Play"} ${label}`}
        className="absolute inset-0 flex items-center justify-center transition-colors hover:bg-basalt-950/20"
      >
        <span
          className={`flex h-11 w-11 items-center justify-center rounded-full border border-bone-50/25 bg-basalt-950/60 text-bone-50 transition-opacity ${
            playing ? "opacity-0 group-hover:opacity-100" : "opacity-100"
          }`}
        >
          <svg viewBox="0 0 12 12" className="h-4 w-4" fill="currentColor" aria-hidden>
            {playing ? <path d="M3 2h2.2v8H3zM6.8 2H9v8H6.8z" /> : <path d="M3.4 2.2 10 6l-6.6 3.8z" />}
          </svg>
        </span>
      </button>
    </div>
  );
}
