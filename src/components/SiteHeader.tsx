import Link from "next/link";
import { Wordmark } from "./Logo";
import { resolveDkgMode } from "@/dkg/client";

/**
 * The header carries the one fact a reader most needs and is least able to check: which knowledge
 * store this instance is actually running against. Claiming a DKG integration while running on the
 * in-process fallback would be the easiest lie in the project to tell by accident, so the mode is
 * read from resolved configuration and shown on every page.
 */
export function SiteHeader({ children }: { children?: React.ReactNode }) {
  const mode = resolveDkgMode();
  // Two lengths for one fact. The badge is the honesty signal and must survive a phone, but the long
  // form wraps to two lines at 375px and shoves the nav out of the header.
  const label = mode === "network" ? "DKG · testnet" : mode === "edge" ? "DKG · edge node" : "local RDF";
  const shortLabel = mode === "network" ? "DKG" : mode === "edge" ? "DKG" : "local";
  const tone =
    mode === "network"
      ? "border-verdigris-500/40 bg-verdigris-900 text-verdigris-400"
      : mode === "edge"
        ? "border-bronze-400/40 bg-bronze-900 text-bronze-300"
        : "border-basalt-700 bg-basalt-850 text-bone-500";

  // Solid rather than translucent-and-blurred. At 85% opacity over a near-black page the blur was
  // invisible, and it cost a compositing layer that repaints on every scroll frame.
  return (
    <header className="sticky top-0 z-30 border-b border-basalt-800 bg-basalt-950">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:gap-4 sm:px-6">
        <Link href="/" className="transition-opacity hover:opacity-80">
          <Wordmark />
        </Link>
        <nav className="ml-auto flex shrink-0 items-center gap-0.5 text-sm sm:gap-1">
          <Link href="/studio" className="rounded px-2 py-1.5 text-bone-400 transition-colors hover:text-bone-50 sm:px-2.5">
            Studio
          </Link>
          <Link
            href="/knowledge"
            className="rounded px-2 py-1.5 text-bone-400 transition-colors hover:text-bone-50 sm:px-2.5"
          >
            Knowledge
          </Link>
          <Link
            href="/ledger"
            className="hidden rounded px-2 py-1.5 text-bone-400 transition-colors hover:text-bone-50 sm:inline-block sm:px-2.5"
          >
            Ledger
          </Link>
          <a
            href="/api/health"
            className="hidden rounded px-2 py-1.5 text-bone-400 transition-colors hover:text-bone-50 sm:inline-block sm:px-2.5"
          >
            Health
          </a>
          <span
            title={`Knowledge store resolved from STELE_DKG=${mode}`}
            className={`ml-1 shrink-0 rounded border px-2 py-1 font-mono text-[10px] whitespace-nowrap uppercase tracking-wider ${tone}`}
          >
            <span className="sm:hidden">{shortLabel}</span>
            <span className="hidden sm:inline">{label}</span>
          </span>
        </nav>
      </div>
      {children}
    </header>
  );
}
