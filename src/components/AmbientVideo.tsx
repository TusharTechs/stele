"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Footage that plays when it is on screen, and only then.
 *
 * `autoPlay` alone does not survive contact with a real page. With a lazy `preload` the browser has
 * nothing buffered when the attribute is evaluated and quietly never starts; measured on this
 * landing page, the hero sat paused at frame zero while `play()` called by hand resolved instantly.
 * Raising `preload` to `auto` fixes that one video by downloading every byte of all of them, which
 * is a poor trade on a page carrying ten.
 *
 * So playback follows visibility. A clip loads when it approaches the viewport, plays while it is
 * there, and pauses when it leaves — which is also the behaviour you want on a phone, where ten
 * simultaneously decoding videos is the difference between a page and a space heater.
 */
export function AmbientVideo({
  src,
  poster,
  className = "",
  ariaHidden = true,
}: {
  src: string;
  poster?: string;
  className?: string;
  ariaHidden?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Someone who has asked for less motion gets the poster frame and nothing else.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const observer = new IntersectionObserver(
      ([entry]) => setNear(entry.isIntersecting),
      // A little margin so a clip has started by the time it is actually looked at.
      { rootMargin: "200px 0px", threshold: 0.01 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /**
   * Ask for playback in a separate pass, after the src has actually been attached.
   *
   * Two things had to be true and only one of them was. Calling `play()` from inside the observer
   * callback asks it of an element that has no source yet, because the src arrives with the
   * re-render that same callback triggers. Waiting for `canplay` instead fixes that and deadlocks:
   * `preload="none"` means the browser fetches nothing until something asks for playback, so the
   * event being waited on is the one that will never fire. `play()` is the ask. It starts the load
   * and resolves when frames are running, so it goes first and nothing waits on anything.
   *
   * It is then asked again on `loadeddata` and on a return to the foreground. A browser is entitled
   * to refuse or suspend playback on a page nobody is looking at, and does: measured here, a clip
   * told to play on a hidden tab ran for a third of a second and stopped. Without the retry it stays
   * stopped after the viewer comes back, and a frozen hero is worse than one that never moved.
   */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (!near) {
      if (!el.paused) el.pause();
      return;
    }

    const start = () => {
      if (document.visibilityState !== "visible") return;
      void el.play().catch(() => undefined);
    };

    start();
    el.addEventListener("loadeddata", start);
    document.addEventListener("visibilitychange", start);
    return () => {
      el.removeEventListener("loadeddata", start);
      document.removeEventListener("visibilitychange", start);
    };
  }, [near]);

  return (
    <video
      ref={ref}
      // Held back until the clip is near the viewport, so a page of ten does not fetch ten videos
      // before anyone has scrolled.
      src={near ? src : undefined}
      poster={poster}
      muted
      loop
      playsInline
      preload="none"
      aria-hidden={ariaHidden}
      className={className}
    />
  );
}
