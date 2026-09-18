"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Wordmark } from "./Logo";
import type { DkgMode } from "@/dkg/client";

/**
 * The header.
 *
 * Three groups, left to right: who this is, what you can read, and the one thing you can do. The
 * first version set all five destinations in one evenly spaced row with the knowledge-store badge
 * loudest of all, which gave a reader no way to tell the app apart from the archive and made a
 * diagnostic chip the brightest object on the page.
 *
 * So the four read-only surfaces stay a list, Studio becomes the action, and the store indicator
 * drops to a coloured dot with its label beside it. It is still on every page, because running on
 * the in-process fallback while implying a DKG integration is the easiest lie in this project to
 * tell by accident, but it no longer shouts over the navigation.
 */

const SURFACES = [
  { href: "/knowledge", label: "Knowledge" },
  { href: "/gallery", label: "Gallery" },
  { href: "/compare", label: "Compare" },
  { href: "/ledger", label: "Ledger" },
] as const;

export function SiteNav({ mode, overHero = false }: { mode: DkgMode; overHero?: boolean }) {
  const pathname = usePathname();
  // Over footage the bar starts invisible and earns its background by scrolling. A solid rule
  // across the top of a hero cuts the frame in half and is the single thing that makes a cinematic
  // page look like a dashboard wearing a video.
  const [solid, setSolid] = useState(!overHero);

  useEffect(() => {
    if (!overHero) return;
    const onScroll = () => setSolid(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [overHero]);

  // Closed by the link that navigates rather than by watching the path. Both close the panel, but
  // an effect on `pathname` also runs a second render on every navigation to set state that was
  // already correct.
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header
      className={`sticky top-0 z-30 border-b transition-colors duration-300 ${
        solid || menuOpen ? "border-basalt-800 bg-basalt-950" : "border-transparent bg-transparent"
      }`}
    >
      {/* A scrim only while the bar is transparent, so type stays legible over a bright frame
          without a visible edge appearing across the footage. */}
      {!solid && !menuOpen ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-basalt-950/80 to-transparent"
        />
      ) : null}

      <div className="relative mx-auto flex h-16 max-w-7xl items-center gap-5 px-4 sm:px-6">
        <Link href="/" className="shrink-0 transition-opacity hover:opacity-80" aria-label="Stele home">
          <Wordmark />
        </Link>

        <span className="hidden h-5 w-px bg-basalt-700 md:block" aria-hidden />

        <nav aria-label="Sections" className="hidden items-center gap-1 md:flex">
          {SURFACES.map((item) => (
            <NavLink key={item.href} href={item.href} active={pathname.startsWith(item.href)}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-3 sm:gap-4">
          <StoreIndicator mode={mode} />

          <Link
            href="/studio"
            className={`hidden rounded border px-3.5 py-1.5 text-sm font-medium transition-colors sm:inline-block ${
              pathname.startsWith("/studio")
                ? "border-verdigris-500/50 bg-verdigris-900 text-verdigris-400"
                : "border-basalt-600 text-bone-100 hover:border-verdigris-500 hover:bg-verdigris-900/40 hover:text-verdigris-400"
            }`}
          >
            Studio
          </Link>

          <button
            type="button"
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((open) => !open)}
            className="-mr-1 rounded p-1.5 text-bone-400 transition-colors hover:text-bone-50 md:hidden"
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
              {menuOpen ? (
                <path
                  d="M3.5 3.5l9 9m0-9-9 9"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              ) : (
                <path
                  d="M2 4.5h12M2 11.5h12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              )}
            </svg>
          </button>
        </div>
      </div>

      {menuOpen ? (
        <nav aria-label="Sections" className="border-t border-basalt-800 bg-basalt-950 px-4 py-2 md:hidden">
          {[{ href: "/studio", label: "Studio" }, ...SURFACES].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMenuOpen(false)}
              className={`block rounded px-2 py-2.5 text-sm transition-colors ${
                pathname.startsWith(item.href) ? "text-verdigris-400" : "text-bone-300 hover:text-bone-50"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      ) : null}
    </header>
  );
}

/**
 * A section link, marked active by a rule cut under it rather than by a filled pill.
 *
 * The rest of the product separates things with the carved line in `globals.css`; a rounded chip
 * here would have been the only piece of navigation furniture that belonged to a different set.
 */
function NavLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`relative rounded px-2.5 py-1.5 text-sm transition-colors ${
        active ? "text-bone-50" : "text-bone-400 hover:text-bone-50"
      }`}
    >
      {children}
      {active ? (
        <span
          aria-hidden
          className="absolute inset-x-2.5 -bottom-[3px] h-px bg-verdigris-500"
        />
      ) : null}
    </Link>
  );
}

/**
 * Which knowledge store this instance is running against, checked rather than declared.
 *
 * Configuration alone is not worth showing. `STELE_DKG=edge` says what was asked for, and a header
 * that reports it would go on claiming a DKG node through the entire window where the daemon is
 * down, which is the one failure this indicator exists to catch. So the resolved mode renders on
 * the server for an immediate, stable first paint, and a probe corrects it once the page is live.
 *
 * It links to the full report for the same reason. A status claim nobody can open is decoration.
 */
function StoreIndicator({ mode }: { mode: DkgMode }) {
  const [reachable, setReachable] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    // The local store is in this process. There is nothing to reach and nothing to be wrong about.
    if (mode === "file") return;

    const abort = new AbortController();
    fetch("/api/health?probe=store", { cache: "no-store", signal: abort.signal })
      .then((response) => response.json())
      .then((body) => setReachable(Boolean(body?.knowledge?.ready)))
      .catch(() => {
        if (!abort.signal.aborted) setReachable(false);
      });
    return () => abort.abort();
  }, [mode]);

  const down = reachable === false;
  const label = down
    ? "DKG unreachable"
    : mode === "network"
      ? "DKG testnet"
      : mode === "edge"
        ? "DKG edge node"
        : "local RDF store";

  const dot = down
    ? "bg-terracotta-400"
    : mode === "network"
      ? "bg-verdigris-400"
      : mode === "edge"
        ? "bg-bronze-400"
        : "bg-bone-500";

  const title = down
    ? `This instance is configured for ${mode === "network" ? "the DKG testnet" : "a DKG edge node"}, but the node did not answer. Nothing here is being written to it right now.`
    : mode === "network"
      ? "Knowledge is written to the OriginTrail DKG and anchored on chain. Open the full report."
      : mode === "edge"
        ? "Knowledge is written to an OriginTrail Edge Node and shared with peers, without a chain publish. Open the full report."
        : "No DKG node is configured, so knowledge lives in an in-process RDF store. Real SPARQL, but not the DKG. Open the full report.";

  return (
    <a
      href="/api/health"
      title={title}
      className="flex items-center gap-2 rounded font-mono text-[10px] uppercase tracking-[0.14em] text-bone-500 transition-colors hover:text-bone-200"
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden />
      <span className="hidden whitespace-nowrap lg:inline">{label}</span>
      <span className="sr-only lg:hidden">{label}</span>
    </a>
  );
}
