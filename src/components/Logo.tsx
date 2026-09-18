/**
 * The mark.
 *
 * A stele is an upright slab standing on a base, with a record cut into it. So: a tapered slab, a
 * plinth line under it, and an inscription that is a three-node graph rather than lines of text —
 * which is the project in one detail. The record is not prose. It is a graph, and it is meant to
 * outlast whoever cut it.
 *
 * The silhouette went through four passes to get here. An arched top read unmistakably as a
 * gravestone, a pediment read as a house, and a bare tapered slab read as a shopping bag. The
 * plinth is what fixes it: nothing else stands on a base like that, and it survives 16px where
 * interior detail does not.
 *
 * Drawn on a 24-unit grid in `currentColor`, so it takes the colour of whatever it sits on rather
 * than carrying a palette around.
 *
 * On hover the inscription is cut rather than spun: node, edge, node, edge, node, in the order a
 * mason would work. Rotating a standing stone would contradict the one thing the shape is for.
 * The classes here are the handles for that; the timing lives in `globals.css`.
 */
export function LogoMark({ className = "", title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {/* The slab, tapering slightly towards the top as a standing stone does. */}
      <path
        d="M6.4 20.6 7.6 5.2h8.8l1.2 15.4z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      {/* The plinth. Small line, most of the work. */}
      <path d="M4.6 20.6h14.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      {/* The inscription: two edges…
          `pathLength` normalises both segments to a 100 unit run so the draw-on animation in
          globals.css can use round numbers instead of the measured geometry, which would otherwise
          have to be recomputed by hand every time the mark is nudged. */}
      <path
        className="ins-edge"
        pathLength="100"
        d="M9.6 10.2l4.7 2.9M14.3 13.1 9.6 16"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        opacity="0.7"
      />
      {/* …and the three nodes they join, in the order the edges reach them. */}
      <circle className="ins-node" cx="9.6" cy="10.2" r="1.45" fill="currentColor" />
      <circle className="ins-node ins-node-b" cx="14.6" cy="13.1" r="1.45" fill="currentColor" />
      <circle className="ins-node ins-node-c" cx="9.6" cy="16" r="1.45" fill="currentColor" />
    </svg>
  );
}

/**
 * The mark and the name together.
 *
 * The name always ships with the mark. A bare glyph only works for a brand people already recognise,
 * and every studio worth imitating — Runway, Luma, Higgsfield — sets the name in the header.
 *
 * The tagline does not belong here. A line of positioning copy in persistent navigation is what a
 * brand does when it is not sure the name carries; the hero says it once, properly, and the footer
 * closes on it. Off by default, available for the places that genuinely want it.
 */
export function Wordmark({ withTagline = false }: { withTagline?: boolean }) {
  return (
    <span className="inscribe inline-flex items-center gap-2.5">
      <LogoMark className="h-[22px] w-[22px] shrink-0 text-verdigris-400" title="Stele" />
      <span className="font-mono text-base font-semibold tracking-[0.2em] text-bone-50 uppercase">
        Stele
      </span>
      {withTagline ? (
        <>
          <span className="hidden h-3 w-px bg-basalt-600 sm:inline-block" aria-hidden />
          <span className="hidden text-xs text-bone-500 sm:inline">every frame, on the record</span>
        </>
      ) : null}
    </span>
  );
}
