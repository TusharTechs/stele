import { runProduction, type PipelineEvent, type RunOptions } from "./pipeline";

/**
 * Runs in flight, and who is watching them.
 *
 * A production takes minutes, and the browser cannot be what keeps it alive: a reload, a closed lid
 * or a flaky connection would otherwise abandon a run halfway through and waste everything it had
 * already paid the network for. So a run is started detached and this registry is what the UI
 * subscribes to — reconnecting replays the events so far and then continues live, and two tabs can
 * watch the same run without starting two.
 */

export interface ActiveRun {
  projectId: string;
  startedAt: number;
  events: PipelineEvent[];
  listeners: Set<(event: PipelineEvent) => void>;
  finished: boolean;
  promise: Promise<unknown>;
}

const active = new Map<string, ActiveRun>();

export function isRunning(projectId: string): boolean {
  return active.get(projectId)?.finished === false;
}

export function activeRun(projectId: string): ActiveRun | undefined {
  return active.get(projectId);
}

export class AlreadyRunning extends Error {
  constructor(projectId: string) {
    super(`A production is already running for ${projectId}.`);
  }
}

/**
 * Start a run, or refuse if one is already going.
 *
 * Refusing matters: two concurrent runs on one project would interleave their writes to the same
 * project file and both would compile against a canon the other is changing underneath them.
 */
export function startRun(options: RunOptions): ActiveRun {
  const current = active.get(options.projectId);
  if (current && !current.finished) throw new AlreadyRunning(options.projectId);

  const record: ActiveRun = {
    projectId: options.projectId,
    startedAt: Date.now(),
    events: [],
    listeners: new Set(),
    finished: false,
    promise: Promise.resolve(),
  };

  const emit = (event: PipelineEvent) => {
    record.events.push(event);
    for (const listener of record.listeners) {
      try {
        listener(event);
      } catch {
        // A listener whose socket has gone is not the run's problem.
      }
    }
  };

  record.promise = runProduction({ ...options, onEvent: emit })
    .catch((error: unknown) => {
      emit({ type: "error", message: error instanceof Error ? error.message : String(error) });
    })
    .finally(() => {
      record.finished = true;
      // Give a reconnecting client a window to collect the tail before the record is dropped.
      setTimeout(() => {
        if (active.get(options.projectId) === record) active.delete(options.projectId);
      }, 60_000);
    });

  active.set(options.projectId, record);
  return record;
}

/** Replays what has happened so far, then streams what happens next. Returns an unsubscribe. */
export function watchRun(projectId: string, listener: (event: PipelineEvent) => void): () => void {
  const record = active.get(projectId);
  if (!record) return () => undefined;

  for (const event of record.events) listener(event);
  if (record.finished) return () => undefined;

  record.listeners.add(listener);
  return () => record.listeners.delete(listener);
}
