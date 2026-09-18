import { z } from "zod";
import { LivepeerAgent, LivepeerError, type RunResult } from "./mcp-client";

/**
 * Which capability does which job.
 *
 * Every name here was read off `describe_capability` on the live network and then actually run,
 * so the parameter shapes below are the ones the provider declares rather than the ones that look
 * plausible. The surface does not fuzzy-match: a name is a contract, and sending a parameter a
 * capability does not declare gets it silently dropped (the network says so in `warnings`, which
 * this client keeps). Re-verify with `npm run probe` before changing anything in this file.
 */
export const CAPABILITY = {
  /** Reasoning. Cheap and quick enough to sit inside a loop: ~$0.0001/call, p50 2.1s. */
  reason: "gemini-text",
  /** Pulls readable text off a public page, so a claim in a script can carry its source. */
  ground: "obscura-extract-text",
  /** Keyframes. Prompt-only — it declares no aspect_ratio, whatever the examples elsewhere suggest. */
  keyframe: "flux-schnell",
  /**
   * Derives a shot's keyframe from the film's anchor frame.
   *
   * The capability's own description is "instruction image edit that preserves the source subject",
   * which is precisely the property a multi-shot film needs and which no amount of prompt wording
   * can supply. See `renderShots` in the pipeline for why this exists.
   */
  deriveKeyframe: "kontext-edit",
  /** Animates a keyframe. Conditioning each shot on a still is what holds a look together. */
  animate: "ltx-25-i2v-fast",
  /** Text-to-video, for shots with no keyframe to anchor them. */
  shot: "ltx-25-t2v-fast",
  /** The review gate. Genuinely watches the clip and returns text. */
  review: "nemotron-omni-video",
  narrate: "inworld-tts",
  music: "sonilo-v2m",
  concat: "ffmpeg-concat",
  mux: "ffmpeg-mux",
  audioMix: "ffmpeg-audio-mix",
  /**
   * Burns the production record's address onto the film.
   *
   * Requires both `name` and `title` in `inputs`; the network rejects the call before doing any work
   * if either is missing, and says which. Confirmed legible by asking nemotron-omni-video to read
   * the finished clip back, which returned the stamped text verbatim.
   */
  stamp: "hyperframes-lower-third",
} as const;

/*
 * `ffmpeg-reframe` is deliberately absent.
 *
 * It looked like the obvious way to deliver a cut in 9:16 and 1:1. Probed against a live clip with
 * three parameter shapes, the network answered the same way each time: "ffmpeg-reframe does not
 * declare `aspect_ratio` — the provider will ignore it, so that instruction is dropped." It returns
 * a video and ignores the ratio, so a "deliver vertical" button built on it would quietly not
 * reframe. Captions, via whisper-word into ffmpeg-burn-subtitles, are the delivery step that works.
 */

/**
 * Dispatch timeouts, in seconds.
 *
 * `video` matches what the video capabilities declare as their own abort point (300s). The client
 * polls past this by a margin, because giving up at the provider's ceiling means paying for a render
 * and never reading its result.
 */
const TIMEOUT = {
  reason: 60,
  ground: 45,
  keyframe: 60,
  video: 300,
  review: 120,
  audio: 60,
  edit: 60,
  stamp: 130,
} as const;

/** ltx-2.5 takes discrete durations only; anything else is rejected or silently coerced. */
export const SHOT_DURATIONS = [6, 8, 10, 12, 14, 16, 18, 20] as const;

export function snapDuration(seconds: number): number {
  return SHOT_DURATIONS.reduce((best, d) =>
    Math.abs(d - seconds) < Math.abs(best - seconds) ? d : best
  );
}

// ---------------------------------------------------------------- structured reasoning

export class ReasoningError extends Error {}

/**
 * Ask the network to reason, and get back a value that matches `schema`.
 *
 * `gemini-text` returns prose, so the JSON has to be found in it and validated. A model that
 * returns the wrong shape gets exactly one more attempt — with the validation error quoted back to
 * it, which fixes the common cases (a missing field, a number sent as a string). A second failure
 * is a real failure and is raised rather than smoothed over: every downstream stage relies on the
 * shape of what it receives, so a half-parsed object would surface as damage somewhere further on.
 */
export async function think<T>(
  agent: LivepeerAgent,
  stage: string,
  prompt: string,
  schema: z.ZodType<T>
): Promise<{ value: T; costUSD: number; raw: string }> {
  const instruction = `${prompt}\n\nReturn ONLY a single JSON value. No prose, no explanation, no markdown fence.`;
  let cost = 0;
  let lastRaw = "";
  let lastError = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await agent.run({
      capability: CAPABILITY.reason,
      stage,
      prompt:
        attempt === 0
          ? instruction
          : `${instruction}\n\nYour previous reply could not be used. It failed validation with:\n${lastError}\n\nPrevious reply:\n${lastRaw.slice(0, 1500)}\n\nReturn corrected JSON.`,
      timeout: TIMEOUT.reason,
    });
    cost += result.costUSD;

    if (!result.ok || !result.text) {
      lastError = result.error ?? "the capability returned no text";
      continue;
    }

    lastRaw = result.text;
    const candidate = extractJson(result.text);
    if (!candidate) {
      lastError = "no JSON value could be found in the reply";
      continue;
    }

    const parsed = schema.safeParse(candidate);
    if (parsed.success) return { value: parsed.data, costUSD: cost, raw: lastRaw };
    lastError = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
  }

  throw new ReasoningError(`${stage}: could not obtain a valid response — ${lastError}`);
}

/**
 * Recover a JSON value from a model reply.
 *
 * Handles the three things models actually do: answer with clean JSON, wrap it in a markdown fence,
 * or bury it in a sentence. The brace-matching scan is string-aware so a `}` inside a quoted value
 * doesn't truncate the object — which is common here, since findings are free text.
 */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced?.[1] ?? text).trim();

  try {
    return JSON.parse(body);
  } catch {
    // Fall through to scanning.
  }

  for (const [open, close] of [
    ["{", "}"],
    ["[", "]"],
  ] as const) {
    const start = body.indexOf(open);
    if (start === -1) continue;

    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < body.length; i++) {
      const char = body[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;

      if (char === open) depth++;
      else if (char === close) {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(body.slice(start, i + 1));
          } catch {
            break;
          }
        }
      }
    }
  }
  return undefined;
}

// ---------------------------------------------------------------- media stages

export interface MediaOutput {
  url: string;
  costUSD: number;
  capability: string;
  latencyMs: number;
}

export async function makeKeyframe(
  agent: LivepeerAgent,
  stage: string,
  prompt: string,
  idempotencyKey?: string
): Promise<MediaOutput> {
  const result = await agent.runOrThrow({
    capability: CAPABILITY.keyframe,
    stage,
    prompt,
    timeout: TIMEOUT.keyframe,
    // A keyframe is referenced by the production record, so it needs a URL that outlives the run.
    persist: true,
    idempotencyKey,
  });
  return asMedia(result, CAPABILITY.keyframe);
}

/**
 * Produce a later shot's keyframe by editing the film's anchor frame.
 *
 * Cross-shot consistency is a conditioning problem, not a prompt problem. Rendering each shot from
 * its own text prompt gives the generator no shared state to hold on to, so a rule like "keep the
 * lighting identical across all three shots" is an instruction it physically cannot follow — which
 * is exactly what a measured run showed. Deriving each later keyframe from the first carries the
 * subject, palette, surface and light structurally.
 */
export async function deriveKeyframe(
  agent: LivepeerAgent,
  stage: string,
  instruction: string,
  anchorUrl: string,
  idempotencyKey?: string
): Promise<MediaOutput> {
  const result = await agent.runOrThrow({
    capability: CAPABILITY.deriveKeyframe,
    stage,
    prompt: instruction,
    sourceUrl: anchorUrl,
    timeout: TIMEOUT.keyframe,
    persist: true,
    idempotencyKey,
  });
  return asMedia(result, CAPABILITY.deriveKeyframe);
}

export async function animateKeyframe(
  agent: LivepeerAgent,
  stage: string,
  prompt: string,
  keyframeUrl: string,
  durationSeconds: number,
  idempotencyKey?: string
): Promise<MediaOutput> {
  const result = await agent.runOrThrow({
    capability: CAPABILITY.animate,
    stage,
    prompt,
    sourceUrl: keyframeUrl,
    inputs: { duration: snapDuration(durationSeconds), resolution: "720p" },
    timeout: TIMEOUT.video,
    async: true,
    persist: true,
    idempotencyKey,
  });
  return asMedia(result, CAPABILITY.animate);
}

export async function renderShot(
  agent: LivepeerAgent,
  stage: string,
  prompt: string,
  durationSeconds: number,
  idempotencyKey?: string
): Promise<MediaOutput> {
  const result = await agent.runOrThrow({
    capability: CAPABILITY.shot,
    stage,
    prompt,
    inputs: { duration: snapDuration(durationSeconds), resolution: "720p" },
    timeout: TIMEOUT.video,
    async: true,
    persist: true,
    idempotencyKey,
  });
  return asMedia(result, CAPABILITY.shot);
}

/**
 * Show a rendered clip to a model that can watch it, and get back what it saw.
 *
 * This is the difference between reviewing a production and reviewing a description of one. The
 * caller supplies the rubric; the returned text is parsed by the reviewer, not here.
 */
export async function watchVideo(
  agent: LivepeerAgent,
  stage: string,
  videoUrl: string,
  rubric: string
): Promise<{ text: string; costUSD: number }> {
  const result = await agent.runOrThrow({
    capability: CAPABILITY.review,
    stage,
    prompt: rubric,
    inputs: { video_url: videoUrl },
    timeout: TIMEOUT.review,
  });
  return { text: result.text ?? "", costUSD: result.costUSD };
}

export async function narrate(
  agent: LivepeerAgent,
  stage: string,
  script: string
): Promise<MediaOutput> {
  const result = await agent.runOrThrow({
    capability: CAPABILITY.narrate,
    stage,
    prompt: script,
    timeout: TIMEOUT.audio,
    persist: true,
  });
  return asMedia(result, CAPABILITY.narrate);
}

export async function scoreMusic(
  agent: LivepeerAgent,
  stage: string,
  brief: string,
  videoUrl: string
): Promise<MediaOutput> {
  const result = await agent.runOrThrow({
    capability: CAPABILITY.music,
    stage,
    prompt: brief,
    sourceUrl: videoUrl,
    timeout: TIMEOUT.audio,
    persist: true,
  });
  return asMedia(result, CAPABILITY.music);
}

export async function concatClips(
  agent: LivepeerAgent,
  stage: string,
  clips: string[]
): Promise<MediaOutput> {
  const result = await agent.runOrThrow({
    capability: CAPABILITY.concat,
    stage,
    inputs: { clips },
    timeout: TIMEOUT.edit,
    persist: true,
  });
  return asMedia(result, CAPABILITY.concat);
}

/** Lays one audio track onto one clip and returns video. Not to be confused with `ffmpeg-audio-mix`. */
export async function muxAudio(
  agent: LivepeerAgent,
  stage: string,
  videoUrl: string,
  audioUrl: string
): Promise<MediaOutput> {
  const result = await agent.runOrThrow({
    capability: CAPABILITY.mux,
    stage,
    inputs: { video_url: videoUrl, audio_url: audioUrl },
    timeout: TIMEOUT.edit,
    persist: true,
  });
  return asMedia(result, CAPABILITY.mux);
}

/**
 * Give the network something it can actually fetch.
 *
 * A capability cannot read this machine's disk, so a cut served from `/seed/` or any other local
 * path is invisible to it. The seeded demo productions are exactly that: their media was vendored
 * into the repo so the demo works offline, which is right for viewing and useless for any capability
 * that takes the cut as input.
 *
 * Uploading the bytes fixes it. The transport caps inline uploads around 3 MB, and a 6-second 720p
 * cut runs 2.5 to 3.6 MB, so most fit and the ones that don't say so plainly rather than failing
 * somewhere further in.
 */
export async function ensureFetchable(
  agent: LivepeerAgent,
  stage: string,
  url: string,
  readLocal: (path: string) => Promise<Buffer>
): Promise<string> {
  if (/^https?:\/\//.test(url)) return url;

  const bytes = await readLocal(url);
  const megabytes = bytes.byteLength / 1e6;
  if (megabytes > 3) {
    throw new Error(
      `This cut is ${megabytes.toFixed(1)} MB and lives on this machine, which is past the ${3} MB inline upload limit. Capabilities that take the cut as input need a production this instance rendered itself.`
    );
  }

  const payload = await agent.callUpload({
    data: bytes.toString("base64"),
    mime_type: "video/mp4",
    filename: url.split("/").pop() ?? "cut.mp4",
  });
  if (!payload) throw new Error("The cut could not be uploaded for the network to read.");
  void stage;
  return payload;
}

/**
 * Stamp a film with where its record lives.
 *
 * The claim this project makes is that a generated film can carry its provenance. A record nobody
 * can find from the file is a weaker version of that claim, so the address goes on the picture.
 */
export async function stampRecord(
  agent: LivepeerAgent,
  stage: string,
  videoUrl: string,
  name: string,
  recordUrl: string
): Promise<MediaOutput> {
  const result = await agent.runOrThrow({
    capability: CAPABILITY.stamp,
    stage,
    sourceUrl: videoUrl,
    inputs: { name, title: recordUrl },
    timeout: TIMEOUT.stamp,
    persist: true,
  });
  return asMedia(result, CAPABILITY.stamp);
}

/** Reads a public page so a scripted claim can carry the URL it came from. */
export async function groundFromUrl(
  agent: LivepeerAgent,
  stage: string,
  url: string
): Promise<{ text: string; costUSD: number; ok: boolean }> {
  const result = await agent.run({
    capability: CAPABILITY.ground,
    stage,
    inputs: { url },
    timeout: TIMEOUT.ground,
  });
  return { text: result.text ?? "", costUSD: result.costUSD, ok: result.ok };
}

function asMedia(result: RunResult, capability: string): MediaOutput {
  if (!result.url) {
    throw new LivepeerError(
      `${capability} reported success but returned no output URL.`,
      capability,
      result.call
    );
  }
  return {
    url: result.url,
    costUSD: result.costUSD,
    capability,
    latencyMs: result.call.latencyMs,
  };
}
