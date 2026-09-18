import Link from "next/link";
import { Wordmark } from "./ui";
import { resolveDkgMode } from "@/dkg/client";

/**
 * The header carries the one fact a reader most needs and is least able to check: which knowledge
 * store this instance is actually running against. Claiming a DKG integration while running on the
 * in-process fallback would be the easiest lie in the project to tell by accident, so the mode is
 * read from resolved configuration and shown on every page.
 */
export function SiteHeader({ children }: { children?: React.ReactNode }) {
  const mode = resolveDkgMode();
  const label = mode === "network" ? "DKG · testnet" : mode === "edge" ? "DKG · edge node" : "local RDF";
  const tone =
    mode === "network"
      ? "border-verdigris-500/40 bg-verdigris-900 text-verdigris-400"
      : mode === "edge"
        ? "border-bronze-400/40 bg-bronze-900 text-bronze-300"
        : "border-basalt-700 bg-basalt-850 text-bone-500";

  return (
    <header className="sticky top-0 z-30 border-b border-basalt-800 bg-basalt-950/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Wordmark />
        <nav className="ml-auto flex items-center gap-1 text-sm">
          <Link href="/studio" className="rounded px-2.5 py-1.5 text-bone-400 transition-colors hover:text-bone-50">
            Studio
          </Link>
          <a
            href="/api/health"
            className="rounded px-2.5 py-1.5 text-bone-400 transition-colors hover:text-bone-50"
          >
            Health
          </a>
          <span
            title={`Knowledge store resolved from STELE_DKG=${mode}`}
            className={`ml-1 rounded border px-2 py-1 font-mono text-[10px] uppercase tracking-wider ${tone}`}
          >
            {label}
          </span>
        </nav>
      </div>
      {children}
    </header>
  );
}
