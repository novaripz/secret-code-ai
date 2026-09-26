import { z } from "zod";
import { body, branchOf, route, type Params } from "@/server/http";
import { runCommand } from "@/server/exec";
import { getProject, treeDir } from "@/server/store";

export const maxDuration = 600;

/** Streams a command's output as newline-delimited JSON events for the terminal panel. */
export const POST = route(async (req, { params }: Params<{ id: string }>) => {
  const { id } = await params;
  const meta = await getProject(id);
  const branch = branchOf(req, meta.activeBranch);
  const { command, timeoutSec } = await body(req, z.object({ command: z.string().min(1).max(500), timeoutSec: z.number().int().min(1).max(600).optional() }));
  const cwd = treeDir(id, branch);
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        const r = await runCommand(command, {
          cwd,
          timeoutMs: (timeoutSec ?? 300) * 1000,
          signal: req.signal,
          onOutput: (s, chunk) => send({ type: "output", stream: s, chunk }),
        });
        send({ type: "exit", exitCode: r.exitCode, durationMs: r.durationMs, timedOut: r.timedOut });
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : String(err) });
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" } });
});
