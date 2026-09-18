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
   * Only the project JSON is included. The media it points at is served from `public/seed`.
   */
  outputFileTracingIncludes: { "/**": [".data/projects/*.json"] },
  outputFileTracingExcludes: { "*": ["docs/**", "demo/**"] },
};

export default nextConfig;
