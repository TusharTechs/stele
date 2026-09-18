import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { ProjectSchema, type Project } from "./schemas";

/**
 * Project state on disk.
 *
 * There is no database on purpose. The knowledge graph is the part of this system that is meant to
 * be durable, shared and verifiable; project state is just the working file that produced it, and
 * giving judges a Postgres to stand up before they can run anything would be a poor trade. One JSON
 * file per project, readable by eye, diffable, and trivially resettable.
 */

const DATA_DIR = process.env.STELE_DATA_DIR ?? path.join(process.cwd(), ".data");
const PROJECT_DIR = path.join(DATA_DIR, "projects");

/**
 * One writer at a time, per project.
 *
 * A run mutates the project from several stages at once — the pipeline appends to the run, the
 * reviewer writes a verdict, the cost ledger grows with every network call — and each mutation is a
 * read-modify-write of the same file. Without serialisation the last writer silently discards the
 * others, which shows up as a run that loses half its shots. Promises are chained per project id so
 * unrelated projects still proceed in parallel.
 */
const locks = new Map<string, Promise<unknown>>();

function withLock<T>(projectId: string, work: () => Promise<T>): Promise<T> {
  const previous = locks.get(projectId) ?? Promise.resolve();
  const next = previous.then(work, work);
  // Keep the chain alive on failure, but don't let a rejected link poison the next caller.
  locks.set(
    projectId,
    next.catch(() => undefined)
  );
  return next;
}

export function newProjectId(): string {
  return crypto.randomBytes(6).toString("hex");
}

function fileFor(projectId: string): string {
  // Ids are generated, but this is a filesystem path built from a value that reaches it via a URL.
  if (!/^[a-z0-9-]{1,64}$/i.test(projectId)) throw new Error(`Invalid project id: ${projectId}`);
  return path.join(PROJECT_DIR, `${projectId}.json`);
}

export async function saveProject(project: Project): Promise<Project> {
  return withLock(project.id, async () => {
    await fs.mkdir(PROJECT_DIR, { recursive: true });
    const next = { ...project, updatedAt: Date.now() };
    await writeAtomically(fileFor(project.id), JSON.stringify(next, null, 2));
    return next;
  });
}

export async function loadProject(projectId: string): Promise<Project | undefined> {
  try {
    const raw = await fs.readFile(fileFor(projectId), "utf8");
    const parsed = ProjectSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      console.warn(`[store] ${projectId} failed validation: ${parsed.error.issues[0]?.message}`);
      return undefined;
    }
    return parsed.data;
  } catch {
    return undefined;
  }
}

/**
 * Read, change, write — with the lock held across all three.
 *
 * Every mutation in the app goes through here rather than load-then-save, so no caller can
 * accidentally hold a stale copy across an await and write it back over someone else's work.
 */
export async function updateProject(
  projectId: string,
  mutate: (project: Project) => Project | Promise<Project>
): Promise<Project> {
  return withLock(projectId, async () => {
    const raw = await fs.readFile(fileFor(projectId), "utf8");
    const current = ProjectSchema.parse(JSON.parse(raw));
    const next = { ...(await mutate(current)), updatedAt: Date.now() };
    await writeAtomically(fileFor(projectId), JSON.stringify(next, null, 2));
    return next;
  });
}

export async function listProjects(): Promise<Project[]> {
  let names: string[];
  try {
    names = await fs.readdir(PROJECT_DIR);
  } catch {
    return [];
  }

  const projects: Project[] = [];
  for (const name of names.filter((n) => n.endsWith(".json"))) {
    const project = await loadProject(name.replace(/\.json$/, ""));
    if (project) projects.push(project);
  }
  return projects.sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Write to a sibling file, then rename over the target.
 *
 * A rename within a directory is atomic, so a process killed mid-write leaves the previous project
 * intact rather than a truncated JSON file. Runs here are long and get interrupted, and losing an
 * entire production's history to a partial write would be an unpleasant way to learn this.
 */
async function writeAtomically(file: string, contents: string): Promise<void> {
  const temp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temp, contents, "utf8");
  await fs.rename(temp, file);
}
