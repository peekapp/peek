import { databasePath, openStore } from "@peek/db";
import type { ScreenState } from "@peek/core/state";
const clients = new Map<
  ReadableStreamDefaultController<Uint8Array>,
  string | undefined
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
  const frames = new Map<string | undefined, Uint8Array>();
  try {
    store = openStore(databasePath(), true);
  } catch {}
  for (const [client, id] of clients) {
    let frame = frames.get(id);
    if (!frame) {
      try {
        if (!store) throw new Error("unavailable");
        const state: ScreenState = store.snapshot(Date.now(), id);
        frame = encoder.encode(`data: ${JSON.stringify(state)}\n\n`);
      } catch (error) {
        const event =
          error instanceof Error && error.message === "screen-not-found"
            ? "removed"
            : "unavailable";
        frame = encoder.encode(`event: ${event}\ndata: {}\n\n`);
      }
      frames.set(id, frame);
    }
    try {
      client.enqueue(frame);
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
      clients.set(controller, screenId);
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
