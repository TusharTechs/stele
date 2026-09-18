/**
 * Freeze the current projects into a demo bundle that ships with the repo.
 *
 * Someone evaluating this clones, installs, and runs — and should see finished productions, real
 * scores and a populated graph within seconds, without a key, without credits, and without waiting
 * four minutes for a render. An empty studio is a fair representation of nothing.
 *
 * Media is downloaded rather than linked. Provider URLs carry the provider's own retention policy,
 * so a demo that points at them is a demo with an expiry date nobody has written down — and the
 * failure mode is a page of broken video players at exactly the wrong moment.
 *
 *   npm run seed            # capture .data into demo/
 *   npm run seed -- --load  # restore demo/ into .data
 */
import fs from "node:fs/promises";
import path from "node:path";
import { listProjects } from "@/core/store";
import { knowledgeStore } from "@/dkg/client";
import { ProjectSchema, type Project } from "@/core/schemas";

const ROOT = process.cwd();
const DEMO_DIR = path.join(ROOT, "demo");
const MEDIA_DIR = path.join(ROOT, "public", "seed");
const DATA_DIR = process.env.STELE_DATA_DIR ?? path.join(ROOT, ".data");

const load = process.argv.includes("--load");
await (load ? restore() : capture());

// ---------------------------------------------------------------- capture

async function capture(): Promise<void> {
  await fs.mkdir(DEMO_DIR, { recursive: true });
  await fs.mkdir(MEDIA_DIR, { recursive: true });

  const projects = await listProjects();
  if (projects.length === 0) throw new Error("No projects to capture.");

  const seen = new Map<string, string>();
  let bytes = 0;
  let failed = 0;

  for (const project of projects) {
    const localised = await mapMedia(project, async (url) => {
      const cached = seen.get(url);
      if (cached) return cached;

      const local = await download(url);
      if (!local) {
        failed++;
        // Keep the original URL: a live link that may expire beats no link at all.
        return url;
      }
      bytes += local.bytes;
      seen.set(url, local.servedAt);
      return local.servedAt;
    });

    await fs.writeFile(
      path.join(DEMO_DIR, `${project.id}.json`),
      JSON.stringify(localised, null, 2),
      "utf8"
    );
    console.log(`captured ${project.id} — "${project.title}" (${project.runs.length} attempts)`);
  }

  console.log(
    `\n${seen.size} media files, ${(bytes / 1e6).toFixed(1)} MB into public/seed/` +
      (failed > 0 ? `\n${failed} could not be downloaded and still point at the provider.` : "")
  );
}

/** Rewrites every media reference on a project through `resolve`, leaving everything else alone. */
async function mapMedia(project: Project, resolve: (url: string) => Promise<string>): Promise<Project> {
  const runs = [];
  for (const run of project.runs) {
    const shots = [];
    for (const shot of run.shots) {
      shots.push({
        ...shot,
        keyframeUrl: shot.keyframeUrl ? await resolve(shot.keyframeUrl) : undefined,
        videoUrl: shot.videoUrl ? await resolve(shot.videoUrl) : undefined,
        anchoredTo: shot.anchoredTo ? await resolve(shot.anchoredTo) : undefined,
      });
    }
    runs.push({
      ...run,
      shots,
      cutUrl: run.cutUrl ? await resolve(run.cutUrl) : undefined,
      narrationUrl: run.narrationUrl ? await resolve(run.narrationUrl) : undefined,
      musicUrl: run.musicUrl ? await resolve(run.musicUrl) : undefined,
    });
  }
  return { ...project, runs };
}

async function download(url: string): Promise<{ servedAt: string; bytes: number } | undefined> {
  if (!url.startsWith("http")) return undefined;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(90_000) });
    if (!response.ok) return undefined;

    const body = Buffer.from(await response.arrayBuffer());
    const type = response.headers.get("content-type") ?? "";
    // The provider's filename is a signed blob id; name the file after the content instead, so the
    // same asset referenced twice is stored once.
    const { createHash } = await import("node:crypto");
    const name = `${createHash("sha256").update(body).digest("hex").slice(0, 16)}${extensionFor(type, url)}`;

    await fs.writeFile(path.join(MEDIA_DIR, name), body);
    return { servedAt: `/seed/${name}`, bytes: body.byteLength };
  } catch {
    return undefined;
  }
}

function extensionFor(contentType: string, url: string): string {
  if (contentType.includes("mp4")) return ".mp4";
  if (contentType.includes("webm")) return ".webm";
  if (contentType.includes("png")) return ".png";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return ".jpg";
  if (contentType.includes("mpeg")) return ".mp3";
  if (contentType.includes("wav")) return ".wav";
  return path.extname(new URL(url).pathname) || ".bin";
}

// ---------------------------------------------------------------- restore

/**
 * Restore the bundle, without overwriting anything.
 *
 * Someone who has already made their own productions should be able to load the demo alongside them
 * rather than lose their work to it, so a project that already exists is left untouched.
 */
async function restore(): Promise<void> {
  let files: string[];
  try {
    files = (await fs.readdir(DEMO_DIR)).filter((f) => f.endsWith(".json"));
  } catch {
    console.log("No demo bundle in this checkout — nothing to load.");
    return;
  }

  const projectDir = path.join(DATA_DIR, "projects");
  await fs.mkdir(projectDir, { recursive: true });

  const store = knowledgeStore();
  let restored = 0;
  let skipped = 0;

  for (const file of files) {
    const project = ProjectSchema.parse(JSON.parse(await fs.readFile(path.join(DEMO_DIR, file), "utf8")));
    const target = path.join(projectDir, `${project.id}.json`);

    try {
      await fs.access(target);
      skipped++;
      continue;
    } catch {
      // Not present, so it is ours to write.
    }

    await fs.writeFile(target, JSON.stringify(project, null, 2), "utf8");
    // Rebuild the graph from the restored state, so the SPARQL console and the compiler have
    // something to read. Without this the projects would appear but the knowledge would not.
    await store.write(project);
    restored++;
    console.log(`restored ${project.id} — "${project.title}"`);
  }

  console.log(
    `\n${restored} project(s) restored into ${path.relative(ROOT, DATA_DIR)}` +
      (skipped > 0 ? `, ${skipped} already present and left alone` : "")
  );
}
