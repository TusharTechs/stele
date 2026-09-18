<div align="center">

# Stele

**An AI studio whose memory and its receipts are the same verifiable knowledge graph.**

*Livepeer Agent Hackathon 2026 — **Track 2: Livepeer Agent + OriginTrail DKG***

</div>

---

## The problem

You got the shot once. Then you never got it again.

Forty prompts in, something finally lands. You could not say which word did it. Two days later you
need one more shot that matches, and you are back at prompt one. Every tool you have used forgets —
and the file you walk away with cannot tell anyone what made it, from what, or under whose direction.

Stele fixes both halves with one mechanism. What a production learns is written to the OriginTrail
DKG as knowledge you own, and that same knowledge is what compiles the next prompt. The record that
steers the work and the record that proves it are the same graph.

## What it does

Give it a brief and the criteria it must satisfy. Then, per attempt:

| | Stage | What happens |
|---|---|---|
| 1 | **Compile** | SPARQL over the DKG returns this production's constraints and accepted lessons. Each row becomes one clause of the prompt. |
| 2 | **Plan** | The shot list is written against the compiled knowledge, not the raw brief. |
| 3 | **Render** | Keyframe → animated shot, one per beat, each conditioned on its still so the look holds. |
| 4 | **Gate** | A video-understanding model *watches* each shot and scores it per criterion. A rejected shot is re-rendered with the reason attached. |
| 5 | **Assemble** | Shots cut together, narration and score laid over, all on the network. |
| 6 | **Review** | The finished cut is watched and scored against every criterion. |
| 7 | **Learn** | Findings become rules for next time — and wait. Nothing steers a render until a human accepts it. |

Everything above runs on Livepeer Agent. There is no second AI vendor anywhere in the system.

## Track 2 — what the knowledge actually does

The hackathon asks whether verifiable knowledge *materially improves* the application. Three
specific answers, each checkable.

### 1. The prompt is compiled from the graph, and every clause knows where it came from

This is the whole design. A prompt here is not a string that gets appended to — it is a list of
**clauses**, and each clause keeps the identity of the constraint or lesson it came from, the
attempt that learned it, and the criterion it was meant to fix.

```ts
CompiledPrompt {
  text: string;
  clauses: Array<{ body, role, sourceKind, sourceIri, sourceAttempt, criterionIndex }>;
}
```

The workshop for this track made the point plainly: a higher score does not prove memory caused the
improvement — you have to look at the knowledge the next prompt actually used. The studio's
**"Why this prompt"** panel is that look, and it is a join over the graph rather than a view of
local state.

If the DKG returns nothing, the prompt is the brief alone and the score drops. That is the
material improvement, and the control run below measures it.

### 2. Knowledge crosses project boundaries, with attribution

A rule proved on one film is worth something on the next one — and on a colleague's. Accepted
lessons are promoted to **Shared Working Memory**, where another production finds them by query.

Verified on the live node: a new project under the studio identity `studio-b`, briefing a
**brushed-steel desk lamp**, discovered four rules proved by `studio-a` on a **matte-black coffee
cup** — arriving with the name of the film that proved them, the studio that owns it, and a
confidence discounted for travelling. They land as proposals, subject to the same human review as
anything learned locally.

This is the part a JSON file cannot fake, and it is why the memory is a graph.

### 3. Every production leaves a record someone else can check

Two Knowledge Assets per project, written as RDF and cumulative per attempt:

**Run Ledger** — what happened. Attempt number, the capability that rendered each artifact, content
hashes, the reviewer's verdict per criterion, cost, and every prompt clause joined to the knowledge
it was compiled from.

**Canon** — what should steer the next attempt. Constraints decomposed from the brief and lessons
the loop proposed, each carrying its status, its confidence, the attempt that learned it, the
criterion it addresses, and who accepted it.

### What is local, what is shared, what is published

| Layer | Holds | In this project |
|---|---|---|
| **Working Memory** | The node's own drafts | Every assertion starts here |
| **Shared Working Memory** | Gossiped to context-graph peers | Both assets, on every write — this is what cross-project inheritance reads |
| **Verifiable Memory** | Anchored on chain, carries a UAL | Only on an explicit **Seal**, never automatically |

Sealing is a deliberate act because it costs gas and cannot be undone. You seal a cut you are
willing to stand behind.

### What never reaches the graph

Only four kinds of thing are written: references the network already hosts, hashes, numbers, and
short reviewable findings. Prompts travel as SHA-256 hashes, never verbatim.

`src/dkg/redact.ts` is the gate every literal passes through — it scrubs credentials, emails, phone
numbers, wallet material and local filesystem paths, and bounds every string. `assertSafe` runs over
the assembled Turtle before it leaves the process and **fails the write** rather than publishing
something that looks like a secret. Media references are allowlisted to hosts the media network
owns, with query strings stripped, because a provenance record that points somewhere unexpected is
worse than one that admits it has no pointer.

## How Livepeer Agent is used

Livepeer Agent is not a component of this system — it is the entire compute layer. Reasoning,
generation, **video understanding**, audio and editing all dispatch to it.

| Stage | Capability | Notes |
|---|---|---|
| Reasoning — intake, shot planning, lesson distillation | `gemini-text` | ~$0.0001/call, p50 2.1s. Cheap enough to sit inside a loop |
| Grounding a brief in a real page | `obscura-extract-text` | Only the URL, time and a content hash are kept |
| Keyframes | `flux-schnell` | Prompt-only; it declares no `aspect_ratio` |
| Shots | `ltx-25-i2v-fast` | Animates the keyframe, which is what holds continuity |
| **Review gate** | `nemotron-omni-video` | Watches the clip. Returns a per-criterion verdict |
| Narration | `inworld-tts` | |
| Score | `sonilo-v2m` | |
| Cut, audio, reframe | `ffmpeg-concat`, `ffmpeg-mux`, `ffmpeg-audio-mix`, `ffmpeg-reframe` | No local ffmpeg — nothing to install |

Two rules the client holds itself to, both mirroring the surface's own design:

- **A capability name is a contract.** Parameters are validated against what the network declares
  before dispatch, and the `warnings` it returns — such as a parameter a provider silently ignored —
  are surfaced in the UI rather than swallowed. Nothing is ever re-routed to a sibling model.
- **Cost is measured, not estimated.** The ledger is built from the network's own
  `cost_usd_estimated`, so the figure on screen is what was billed.

> **Correction to the published docs:** the Get Started page prints the tool-profile header as
> `X-Livepeer Agent-Tool-Profile`. That contains a space, which is not a legal HTTP field name — a
> spec-compliant client throws before the request leaves. The hyphenated form works.

## Evidence

Everything below came from real runs against the live network and a real DKG node. Nothing is
reconstructed.

### The loop, on one project

| Attempt | Learned clauses | Score | "The look is consistent across every shot" |
|---|---|---|---|
| 1 | 0 | **7**/10 | ✕ *"lighting shifts between shots create inconsistency"* |
| 3 | 4 | **8**/10 | ✓ *"lighting and color grading remain consistent"* |

The four clauses that came between were distilled from attempt 1's failure and are all about
lighting consistency — the exact criterion that failed. The causal chain is visible in the studio:
finding → lesson → clause → criterion now met.

Attempt 2 is in the record as `FAILED`. It is left there because a production history that only
shows the attempts that worked is not a production history.

### The control

Claiming memory helped is easy when you only publish the runs that improved. So the studio has a
**Run control** button: the same brief, the same criteria, the same reviewer, with every learned
lesson deliberately withheld at compile time — one variable changed.

<!-- CONTROL-RESULT -->

### The DKG node

```
Node:      stele-node          Role:  edge
Network:   DKG V10 Base Testnet (base:84532)
Peers:     6                   Relay: connected
Store:     oxigraph-worker
```

A Knowledge Asset created and promoted to Shared Working Memory on that node:

```
Status:         swm-shared
Assertion URI:  did:dkg:context-graph:0xd4c8…/stele-studio/_shared_memory/0xd4c8…/0
Merkle root:    0xbecfe126d8476907e899e4327434e1d852eb90b0a4c848b50c3bfd767c538b2c
```

The prompt compiler, reading that node: **18 clauses, 4 learned** in the normal condition,
**4 clauses, 0 learned** with memory withheld.

## Run it

**Nothing installed, no keys** — real SPARQL over an in-process RDF store, real media on keyless
demo credits:

```bash
git clone https://github.com/TusharTechs/stele.git && cd stele
npm install
npm run dev
```

Open <http://localhost:3210>. Write a brief, press **Run first attempt**, accept a lesson or two in
the **Canon** tab, then run again.

> The in-process store runs the *same SPARQL* as the real thing, so the loop is genuine. It is
> **not** evidence of a DKG integration, and the app says so on every page and in `/api/health`.

**With a real DKG node** — the Track 2 path:

```bash
npm install -g @origintrail-official/dkg
dkg init --network testnet --role edge --store oxigraph   # testnet wallets are auto-funded
dkg start
dkg context-graph create stele-studio

echo 'STELE_DKG=edge' >> .env.local
npm run dev
```

The header badge changes from `LOCAL RDF` to `DKG · EDGE NODE`, and `/api/health` reports the
resolved store, the context graph, and whether the daemon actually answers a query.

**Sealing to Verifiable Memory** additionally needs `STELE_DKG=network` and gas in the node's
operational wallet (`dkg wallet`).

Drive the engine without a browser:

```bash
npm run run:cli -- --shots 1                       # a new project, one shot
npm run run:cli -- --project <id> --accept         # accept every lesson, then run again
npm run run:cli -- --project <id> --control        # the control condition
```

**Verify the capability claims yourself**, no account needed:

```bash
grep -rn "agent.livepeer.org" src/livepeer/     # the one endpoint
grep -rn "CAPABILITY = {" -A 20 src/livepeer/capabilities.ts
curl -s localhost:3210/api/health | jq          # resolved stores, live probe
```

## Limitations

Stated plainly, because a reader should be able to tell a working path from a planned one.

- **No UAL yet.** The node is on testnet and holds 1000 TRAC per wallet, but the faucet's own wallet
  was out of Base Sepolia ETH, so it funded TRAC and no gas. Sealing to Verifiable Memory is
  implemented and wired end to end — `dkg ka publish`, UAL and tx-hash parsing, the seal record, the
  production-record page — but it has **not been executed against the chain**. Everything shown above
  ran on Working and Shared Working Memory, which the rules permit.
- **A single-shot film makes one criterion meaningless.** "Consistent across every shot" is degenerate
  with one shot, and the reviewer will sometimes describe a cut between shots that does not exist.
  Use three or more shots for a meaningful run.
- **The reviewer is one model's opinion.** It is consistent enough to steer a loop and specific enough
  to act on, but it is not a panel of humans, and a score should be read as a signal, not a grade.
- **Shot retries are bounded at two.** A shot that still fails is kept rather than discarded — its
  footage is usually usable and its failure is what the next attempt learns from.
- **The node's SPARQL engine returns nothing for `UNION`.** Both queries that needed one are written
  over `VALUES` and `OPTIONAL` instead. If you add a query, avoid `UNION` and check it against both
  stores.
- **No authentication.** Anyone who can reach the port can run productions and spend credits. It is a
  local studio, not a deployed service.
- **Narration and score are mutually exclusive.** `ffmpeg-mux` replaces a clip's audio rather than
  mixing into it, so laying both down would silently discard the narration.

## How it is built

```
src/livepeer/   mcp-client.ts    JSON-RPC over HTTP, session threading, job polling, the call ledger
                capabilities.ts  Which capability does which job, and its verified parameter contract
src/dkg/        ontology.ts      The stele: vocabulary
                serialize.ts     Project state → the two Knowledge Assets, as Turtle
                queries.ts       The SPARQL that changes what the app does
                client.ts        Three stores behind one interface: network, edge, file
                redact.ts        The gate every literal passes through
src/core/       compiler.ts      Graph rows → prompt clauses, with provenance kept
                reviewer.ts      The video-understanding gate
                distiller.ts     Findings → rules for next time
                pipeline.ts      The run loop, resumable stage by stage
src/app/        /                the case, argued with two real cuts
                /studio/[id]     the console: production, canon, graph
                /record/[id]     the production record
```

Next.js 16 · React 19 · TypeScript (strict) · Tailwind v4 · zod · oxigraph.

Runs as a persistent Node process, not serverless: a video render takes minutes and every stage
persists before the next begins, so an interrupted run re-enters where it stopped rather than paying
to redo it.

## License

[Apache-2.0](LICENSE).
