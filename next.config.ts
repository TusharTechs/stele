import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * The offline knowledge store is oxigraph — a WebAssembly build. Next's server bundler
   * must leave it alone: inlining it detaches the .wasm from the module that loads it and
   * every SPARQL query then fails at runtime with a missing-module error.
   */
  serverExternalPackages: ["oxigraph"],

  /**
   * The demo projects have to travel with the server bundle.
   *
   * `.data` is written by the seed step and was excluded from tracing wholesale, which is right for
   * a local checkout where the directory is a working scratch space and wrong for a deploy, where
   * it is the only copy of the record. Excluded and unseeded, a hosted build renders a site with no
   * productions in it: every page technically correct and completely empty.
   *
   * The graph goes too, not just the projects. The seed writes a Turtle file per project beside
   * them, and the in-process store reads those back on every query, so tracing the JSON alone would
   * have deployed the productions with their knowledge missing: a Knowledge page with no rules and
   * a SPARQL console that answers nothing, on the site whose argument is the graph.
   *
   * The media the records point at is served from `public/seed` and needs no tracing.
   */
  outputFileTracingIncludes: { "/**": [".data/**"] },
  outputFileTracingExcludes: { "*": ["docs/**", "demo/**"] },
};

export default nextConfig;
