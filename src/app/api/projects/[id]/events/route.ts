import { activeRun, watchRun } from "@/core/runner";

export const dynamic = "force-dynamic";

/**
 * Server-sent events for a run in progress.
 *
 * Subscribing replays everything that has already happened before streaming what happens next, so a
 * client that arrives late — or reloads mid-render — sees the whole run rather than joining blind.
 * The stream closes itself when the run finishes; the browser's `EventSource` would otherwise
 * reconnect forever to a run that is over.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      let closed = false;

      const send = (payload: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          closed = true;
        }
      };

      // Teardown is collected rather than tracked in named variables, so `finish` is safe to call on
      // the early path — before there is a subscription or a timer to tidy up.
      const cleanups: Array<() => void> = [];

      const finish = () => {
        if (closed) return;
        closed = true;
        for (const cleanup of cleanups) cleanup();
        try {
          controller.close();
        } catch {
          // Already torn down by the client.
        }
      };

      const record = activeRun(id);
      if (!record) {
        send({ type: "idle" });
        // No run to follow. Closing immediately is correct; the client polls the project instead.
        setTimeout(finish, 50);
        return;
      }

      cleanups.push(
        watchRun(id, (event) => {
          send(event);
          if (event.type === "done" || event.type === "error") setTimeout(finish, 250);
        })
      );

      // Proxies and browsers drop a connection that goes quiet, and a video render is several
      // minutes of quiet.
      const heartbeat = setInterval(() => send({ type: "ping", at: Date.now() }), 15_000);
      cleanups.push(() => clearInterval(heartbeat));

      if (record.finished) setTimeout(finish, 250);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      // Without this, a reverse proxy will buffer the whole stream and deliver it at the end.
      "x-accel-buffering": "no",
    },
  });
}
