import { getRun } from "@/server/agent/runs";
import type { Params } from "@/server/http";

export const dynamic = "force-dynamic";
export const maxDuration = 3600;

/**
 * Server-sent events for one run. Replays from `from` (sequence number), then
 * streams live, so a reloaded page picks up exactly where it left off.
 */
export async function GET(req: Request, { params }: Params<{ runId: string }>) {
  const { runId } = await params;
  const run = getRun(runId);
  if (!run) return new Response(JSON.stringify({ error: "Run not found (it may have finished before a server restart)" }), { status: 404, headers: { "content-type": "application/json" } });
  const from = Number(new URL(req.url).searchParams.get("from") ?? 0) || 0;
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          cleanup();
        }
      };
      for (const e of run.events.slice(from)) send(e);
      send({ seq: -1, at: Date.now(), summary: run.summary });
      const done = () => ["completed", "failed", "cancelled"].includes(run.summary.status);
      if (done()) {
        controller.close();
        return;
      }
      const listener = (e: (typeof run.events)[number]) => {
        send(e);
        if (e.event.type === "run" && ["completed", "failed", "cancelled"].includes(e.event.status)) {
          send({ seq: -1, at: Date.now(), summary: run.summary });
          cleanup();
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      };
      run.listeners.add(listener);
      const ping = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          cleanup();
        }
      }, 15000);
      cleanup = () => {
        run.listeners.delete(listener);
        clearInterval(ping);
      };
      req.signal.addEventListener("abort", () => cleanup());
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive", "x-accel-buffering": "no" } });
}
