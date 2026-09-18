import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { extractJson, snapDuration } from "@/livepeer/capabilities";
import { collapseVerdicts } from "@/core/reviewer";
import { assertSafe, safeReference, safeSourceUrl, safeText } from "@/dkg/redact";
import { iriLit, lit, decLit } from "@/dkg/ontology";
import { parseUal } from "@/dkg/client";
import type { Brief } from "@/core/schemas";

/**
 * The pure logic that everything else stands on.
 *
 * These are the functions where a quiet wrong answer does real damage — a prompt that silently loses
 * its knowledge, a secret written into a permanent public record, a criterion promoted from failed to
 * passed. Each case below is one that actually occurred against the live network or would have.
 */

describe("extractJson", () => {
  test("reads a bare JSON object", () => {
    assert.deepEqual(extractJson('{"score":7}'), { score: 7 });
  });

  test("reads it out of a markdown fence", () => {
    assert.deepEqual(extractJson('```json\n{"score":8}\n```'), { score: 8 });
  });

  test("finds it inside surrounding prose", () => {
    assert.deepEqual(extractJson('Here you go: {"score":9} hope that helps'), { score: 9 });
  });

  test("a brace inside a string does not truncate the object", () => {
    // Reviewer findings are free text and do contain braces; a naive scan stops at the first one.
    const value = extractJson('{"note":"the logo } was cropped","met":false}') as Record<string, unknown>;
    assert.equal(value.note, "the logo } was cropped");
    assert.equal(value.met, false);
  });

  test("reads an array", () => {
    assert.deepEqual(extractJson("[1,2,3]"), [1, 2, 3]);
  });

  test("returns undefined when there is no JSON at all", () => {
    assert.equal(extractJson("I could not complete that request."), undefined);
  });
});

describe("snapDuration", () => {
  test("snaps to the discrete values the video capability accepts", () => {
    // ltx-2.5 rejects or silently coerces anything else, which would desynchronise the cost estimate.
    assert.equal(snapDuration(7), 6);
    assert.equal(snapDuration(9), 8);
    assert.equal(snapDuration(3), 6);
    assert.equal(snapDuration(999), 20);
  });
});

describe("redaction", () => {
  test("scrubs credentials from model-authored text", () => {
    const out = safeText("call it with Bearer sk_live_abcd1234efgh and api_key=hunter2");
    assert.ok(!out.includes("sk_live_abcd1234efgh"), out);
    assert.ok(!out.includes("hunter2"), out);
  });

  test("scrubs local paths, which identify the machine and its user", () => {
    const out = safeText("wrote it to /Users/someone/Documents/secret/plan.txt");
    assert.ok(!out.includes("someone"), out);
  });

  test("bounds length so one finding cannot dominate an assertion", () => {
    assert.ok(safeText("x".repeat(9000)).length <= 400);
  });

  test("assertSafe refuses a write rather than publishing a secret", () => {
    // A refused publish is recoverable. A published secret is not.
    assert.throws(() => assertSafe('<a> <b> "Bearer sk_live_abcd1234efgh" .'));
    assert.throws(() => assertSafe('<a> <b> "/Users/someone/x" .'));
    assert.doesNotThrow(() => assertSafe('<a> <b> "a perfectly ordinary finding" .'));
  });

  test("references are allowlisted to hosts the media network owns", () => {
    assert.ok(safeReference("https://agent.livepeer.org/a/xyz/clip.mp4"));
    assert.ok(safeReference("https://v3b.fal.media/files/b/x.mp4"));
    assert.equal(safeReference("https://evil.example.com/clip.mp4"), undefined);
    assert.equal(safeReference("http://agent.livepeer.org/a/x.mp4"), undefined, "http is not allowed");
    assert.equal(safeReference("not a url"), undefined);
  });

  test("a reference keeps its path but loses expiring signature params", () => {
    assert.equal(
      safeReference("https://agent.livepeer.org/a/xyz/clip.mp4?sig=expires-soon"),
      "https://agent.livepeer.org/a/xyz/clip.mp4"
    );
  });

  test("a grounding URL is stripped of embedded credentials", () => {
    assert.equal(safeSourceUrl("https://user:pass@example.com/page"), "https://example.com/page");
    assert.equal(safeSourceUrl("http://example.com"), undefined);
  });
});

describe("turtle serialisation", () => {
  test("escapes quotes and newlines in model-authored literals", () => {
    assert.equal(lit('he said "no"\nthen left'), '"he said \\"no\\"\\nthen left"');
  });

  test("decimals never use exponent notation, which Turtle rejects", () => {
    // String(1e-7) is "1e-7", and a Turtle parser rejects that for xsd:decimal.
    const numeric = (usd: number) => decLit(usd).split("^^")[0];
    assert.ok(!numeric(0.0000001).includes("e"), numeric(0.0000001));
    assert.ok(!numeric(1234567.5).includes("e"), numeric(1234567.5));
    assert.equal(numeric(0.0001), '"0.000100"', "a reasoning call's cost survives to the ledger");
  });

  test("wraps a bare IRI read back out of a SPARQL binding", () => {
    // A binding carries the term's value, unbracketed. Emitting that makes the parser read
    // "https:" as an undeclared prefix and reject the entire assertion.
    assert.equal(iriLit("https://stele.studio/g/x"), "<https://stele.studio/g/x>");
    assert.equal(iriLit("<https://stele.studio/g/x>"), "<https://stele.studio/g/x>");
    assert.equal(iriLit("not-an-iri"), undefined);
  });
});

describe("collapseVerdicts", () => {
  const brief = {
    criteria: [
      { index: 0, body: "hero" },
      { index: 1, body: "consistent" },
    ],
  } as Brief;

  test("collapses the duplicates a real reviewer returned", () => {
    // Observed live: three criteria came back as six verdicts, the avoid-rules reusing indices 0-2.
    const out = collapseVerdicts(
      [
        { index: 0, met: true, note: "hero ok" },
        { index: 1, met: true, note: "consistent ok" },
        { index: 0, met: true, note: "no logos" },
        { index: 1, met: true, note: "no blowout" },
      ],
      brief
    );
    assert.equal(out.length, 2);
  });

  test("where duplicates disagree, unmet wins", () => {
    const out = collapseVerdicts(
      [
        { index: 0, met: true, note: "looked fine" },
        { index: 0, met: false, note: "actually the subject is cropped" },
      ],
      brief
    );
    assert.equal(out[0].met, false);
    assert.match(out[0].note, /cropped/, "keeps the note that explains the failure");
  });

  test("drops verdicts for criteria the brief never had", () => {
    const out = collapseVerdicts([{ index: 7, met: false, note: "invented" }], brief);
    assert.equal(out.length, 0);
  });
});

describe("parseUal", () => {
  test("recovers a UAL from CLI output", () => {
    assert.equal(
      parseUal("published ok\n  UAL: did:dkg:base:84532/0xabc/42\n"),
      "did:dkg:base:84532/0xabc/42"
    );
  });

  test("returns undefined when nothing was published", () => {
    assert.equal(parseUal("nothing to publish"), undefined);
  });
});
