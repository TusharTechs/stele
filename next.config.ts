import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * The offline knowledge store is oxigraph — a WebAssembly build. Next's server bundler
   * must leave it alone: inlining it detaches the .wasm from the module that loads it and
   * every SPARQL query then fails at runtime with a missing-module error.
   */
  serverExternalPackages: ["oxigraph"],
  outputFileTracingExcludes: { "*": [".data/**", "docs/**"] },
};

export default nextConfig;
