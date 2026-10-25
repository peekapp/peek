import { databasePath, openStore } from "@peek/db";
import type { ScreenHeartbeat, ScreenState } from "@peek/core/state";
const clients = new Map<
  ReadableStreamDefaultController<Uint8Array>,
  { screenId?: string; content?: string; sentAt: number }
>();
let timer: ReturnType<typeof setInterval> | undefined;
const encoder = new TextEncoder();
function remove(client: ReadableStreamDefaultController<Uint8Array>) {
  clients.delete(client);
  if (!clients.size && timer) {
    clearInterval(timer);
    timer = undefined;
  }
}
function broadcast() {
  let store: ReturnType<typeof openStore> | undefined;
  const now = Date.now();
  const frames = new Map<
    string | undefined,
    { content: string; snapshot: Uint8Array; heartbeat: Uint8Array }
  >();
  try {
    store = openStore(databasePath(), true);
  } catch {}
  for (const [client, previous] of clients) {
    if (client.desiredSize !== null && client.desiredSize <= 0) continue;
    const id = previous.screenId;
    let frame = frames.get(id);
    if (!frame) {
      try {
        if (!store) throw new Error("unavailable");
        const state: ScreenState = store.snapshot(now, id);
        const { serverTime, heartbeat, revision, ...content } = state;
        const health: ScreenHeartbeat = { serverTime, heartbeat };
        frame = {
          content: JSON.stringify(content),
          snapshot: encoder.encode(`data: ${JSON.stringify(state)}\n\n`),
          heartbeat: encoder.encode(`event: heartbeat\ndata: ${JSON.stringify(health)}\n\n`),
        };
      } catch (error) {
        const event =
          error instanceof Error && error.message === "screen-not-found"
            ? "removed"
            : "unavailable";
        const errorFrame = encoder.encode(`event: ${event}\ndata: {}\n\n`);
        frame = { content: event, snapshot: errorFrame, heartbeat: errorFrame };
      }
      frames.set(id, frame);
    }
    try {
      if (previous.content !== frame.content) {
        client.enqueue(frame.snapshot);
        previous.content = frame.content;
      } else if (now - previous.sentAt >= 5000) {
        client.enqueue(frame.heartbeat);
      } else {
        continue;
      }
      previous.sentAt = now;
    } catch {
      remove(client);
    }
  }
  store?.close();
}
export function screenStream(request: Request, screenId?: string) {
  let current: ReadableStreamDefaultController<Uint8Array>;
  const abort = () => {
    if (current) {
      remove(current);
      try {
        current.close();
      } catch {}
    }
  };
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      current = controller;
      if (request.signal.aborted) {
        controller.close();
        return;
      }
      clients.set(controller, { screenId, sentAt: 0 });
      broadcast();
      if (!timer) timer = setInterval(broadcast, 1000);
      request.signal.addEventListener("abort", abort, { once: true });
    },
    cancel() {
      remove(current);
      request.signal.removeEventListener("abort", abort);
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
