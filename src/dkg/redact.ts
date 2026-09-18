/**
 * The gate every literal passes through before it reaches the graph.
 *
 * A Knowledge Asset is durable and, once shared, not ours alone to unpublish — so the safe
 * assumption is that anything written here is permanent and public. The hackathon rules are
 * explicit about this, and they are right to be: credentials, personal data, local paths and raw
 * prompts have no business in a provenance record.
 *
 * The policy is deliberately narrow. Only four kinds of thing are written: **references** (URLs the
 * network already hosts), **hashes**, **numbers** (scores, costs, counts), and **short reviewable
 * findings**. Prompts travel as hashes. Everything textual is scrubbed and truncated on the way
 * through, and `assertSafe` is the belt-and-braces check for anything constructed by hand.
 */

const SCRUBBERS: Array<[RegExp, string]> = [
  [/Bearer\s+[A-Za-z0-9._-]{8,}/gi, "Bearer [redacted]"],
  [/\bsk_[A-Za-z0-9._-]{8,}/g, "[redacted-key]"],
  [/\b0x[a-fA-F0-9]{40,}\b/g, "[redacted-hex]"],
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]"],
  [/\+?\d[\d().\s-]{9,}\d/g, "[redacted-number]"],
  [
    /\b(api[_\s-]?key|access[_\s-]?token|token|password|secret|mnemonic|private[_\s-]?key|seed[_\s-]?phrase)\b\s*[:=]?\s*\S+/gi,
    "$1 [redacted]",
  ],
  // Local filesystem paths identify the machine and its user; they are never useful downstream.
  [/(?:\/Users\/|\/home\/|[A-Z]:\\Users\\)[^\s"']+/g, "[redacted-path]"],
];

const MAX_FINDING_CHARS = 400;

/** Scrub and bound a model-authored string destined for the graph. */
export function safeText(value: string, maxChars = MAX_FINDING_CHARS): string {
  let out = String(value ?? "");
  for (const [pattern, replacement] of SCRUBBERS) out = out.replace(pattern, replacement);
  out = out.replace(/\s+/g, " ").trim();
  return out.length > maxChars ? `${out.slice(0, maxChars - 1).trimEnd()}…` : out;
}

/**
 * Only allow references the media network itself hosts.
 *
 * A reference is the one field where an arbitrary string becomes a link others will follow, so an
 * unrecognised host is dropped rather than recorded — a provenance record that points somewhere
 * unexpected is worse than one that admits it has no pointer.
 */
const ALLOWED_REFERENCE_HOSTS = [/(^|\.)livepeer\.org$/i, /(^|\.)fal\.media$/i, /(^|\.)daydream\.live$/i];

export function safeReference(value: string | undefined): string | undefined {
  if (!value) return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:") return undefined;
  if (!ALLOWED_REFERENCE_HOSTS.some((pattern) => pattern.test(url.hostname))) return undefined;
  // Query strings on provider URLs carry signatures and expiry tokens. The path is the durable part.
  url.search = "";
  return url.toString();
}

/** A source URL supplied by the user for grounding — any https origin, but stripped of credentials. */
export function safeSourceUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return undefined;
    url.username = "";
    url.password = "";
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

/**
 * Last line of defence, run over the assembled Turtle before it leaves the process.
 *
 * `safeText` is applied per field, but Turtle is assembled from many fields by several call sites;
 * one that forgets is a silent leak. Failing the write is the right response — a refused publish is
 * recoverable, a published secret is not.
 */
export function assertSafe(turtle: string): void {
  const leaks: string[] = [];
  if (/Bearer\s+[A-Za-z0-9._-]{8,}/i.test(turtle)) leaks.push("a bearer token");
  if (/\bsk_[A-Za-z0-9._-]{8,}/.test(turtle)) leaks.push("an API key");
  if (/(?:\/Users\/|\/home\/|[A-Z]:\\Users\\)/.test(turtle)) leaks.push("a local filesystem path");
  if (/\b(mnemonic|seed phrase|private key)\b/i.test(turtle)) leaks.push("wallet material");

  if (leaks.length > 0) {
    throw new Error(
      `Refusing to write to the knowledge graph: the assertion appears to contain ${leaks.join(", ")}.`
    );
  }
}
