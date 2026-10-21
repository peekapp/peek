import { readState } from "../../../../lib/server-state";
export const dynamic = "force-dynamic";

// One database read per second shared by all connected screens in this process.
const clients = new Set<ReadableStreamDefaultController<Uint8Array>>();
let timer: ReturnType<typeof setInterval> | undefined;
const encoder = new TextEncoder();
function frame() {
  try {
    return encoder.encode(`data: ${JSON.stringify(readState())}\n\n`);
  } catch {
    return encoder.encode("event: unavailable\ndata: {}\n\n");
  }
}
function remove(client: ReadableStreamDefaultController<Uint8Array>) {
  clients.delete(client);
  if (clients.size === 0 && timer) {
    clearInterval(timer);
    timer = undefined;
  }
}
export function GET(request: Request) {
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
      clients.add(controller);
      controller.enqueue(frame());
      if (!timer)
        timer = setInterval(() => {
          const data = frame();
          for (const client of clients) {
            try {
              client.enqueue(data);
            } catch {
              remove(client);
            }
          }
        }, 1000);
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
