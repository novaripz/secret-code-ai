import { test, assert } from "./harness";
import * as store from "../../src/server/store";
import { startRun, getRun, resolveApproval } from "../../src/server/agent/runs";
import type { Provider, TurnRequest, TurnResult, ToolCall } from "../../src/server/agent/providers/types";
import type { RunEvent } from "../../src/core/agent/events";

/** A provider that plays back a fixed script of tool calls, one turn at a time. */
function scripted(turns: ((req: TurnRequest) => ToolCall[] | string)[]): Provider & { seen: TurnRequest[] } {
  let i = 0;
  const seen: TurnRequest[] = [];
  return {
    id: "scripted",
    label: "Scripted",
    model: "test",
    seen,
    async turn(req): Promise<TurnResult> {
      seen.push({ ...req, messages: [...req.messages] });
      const step = turns[i++];
      if (!step) return { text: "done", toolCalls: [], stopReason: "end_turn", model: "test" };
      const out = step(req);
      if (typeof out === "string") return { text: out, toolCalls: [], stopReason: "end_turn", model: "test" };
      return { text: "", toolCalls: out, stopReason: "tool_use", model: "test", usage: { inputTokens: 10, outputTokens: 10 } };
    },
  };
}

async function waitFor(runId: string, ms = 20000): Promise<void> {
  const t = Date.now();
  for (;;) {
    const r = getRun(runId)!;
    if (!["running", "waiting-approval"].includes(r.summary.status)) return;
    if (Date.now() - t > ms) throw new Error("run timed out");
    await new Promise((r) => setTimeout(r, 20));
  }
}

const BAD_SERVER = `--!strict
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Net = require(ReplicatedStorage.Shared.Net)
Net.event("Notify"):FireServer("oops")
`;
const GOOD_SERVER = `--!strict
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Net = require(ReplicatedStorage.Shared.Net)
Players.PlayerAdded:Connect(function(player)
	Net.event("Notify"):FireClient(player, "Welcome", "Have fun!")
end)
`;

test("autopilot: plan, write, the gate catches a client/server bug, the model fixes it, run completes verified", async () => {
  const meta = await store.createProject({ name: "Gate Test", kind: "roblox-experience" });
  const provider = scripted([
    () => [{ id: "t1", name: "create_plan", input: { steps: ["Write a welcome script", "Verify"] } }],
    () => [{ id: "t2", name: "generate_luau", input: { role: "server-script", name: "Welcome", source: BAD_SERVER } }],
    () => [{ id: "t3", name: "finish", input: { summary: "Added a welcome message." } }],
    (req) => {
      const last = req.messages[req.messages.length - 1];
      assert.equal(last.role, "user");
      assert.match((last as { content: string }).content, /FireServer can only be called from the client/);
      return [{ id: "t4", name: "write_file", input: { path: "src/server/Welcome.server.luau", content: GOOD_SERVER } }];
    },
    () => [{ id: "t5", name: "finish", input: { summary: "Players get a welcome notification when they join." } }],
  ]);
  const events: RunEvent[] = [];
  const run = await startRun({ projectId: meta.id, branch: "main", prompt: "Welcome players", mode: "autopilot", providerOverride: provider });
  run.listeners.add((e) => events.push(e.event));
  await waitFor(run.id);
  const s = getRun(run.id)!.summary;
  assert.equal(s.status, "completed", JSON.stringify(events.filter((e) => e.type === "error")));
  assert.equal(s.finalText, "Players get a welcome notification when they join.");
  assert.deepEqual(s.changedFiles, ["src/server/Welcome.server.luau"]);
  assert.equal(s.checks?.errors, 0);
  const phases = events.filter((e) => e.type === "phase").map((e) => (e as { phase: string }).phase);
  for (const p of ["coding", "validating", "debugging", "complete"]) assert.ok(phases.includes(p), `missing phase ${p}: ${phases}`);
  const file = await store.readFile(meta.id, "main", "src/server/Welcome.server.luau");
  assert.match(file.data as string, /FireClient/);
  const snaps = await store.listSnapshots(meta.id, "main");
  assert.ok(snaps.some((x) => x.reason === "agent-start") && snaps.some((x) => x.reason === "agent-end"));
});

test("interactive mode asks before destructive tools and honours a rejection", async () => {
  const meta = await store.createProject({ name: "Approval Test", kind: "roblox-experience" });
  const provider = scripted([
    () => [{ id: "d1", name: "delete_file", input: { path: "src/client/HudController.luau", reason: "cleanup" } }],
    (req) => {
      const last = req.messages[req.messages.length - 1] as { role: string; results?: { content: string; isError?: boolean }[] };
      assert.equal(last.role, "tool");
      assert.ok(last.results![0].isError);
      assert.match(last.results![0].content, /rejected/);
      return "Understood, leaving it.";
    },
  ]);
  const run = await startRun({ projectId: meta.id, branch: "main", prompt: "remove the hud", mode: "chat", providerOverride: provider });
  const t = Date.now();
  while (getRun(run.id)!.approvals.size === 0) {
    if (Date.now() - t > 5000) throw new Error("no approval requested");
    await new Promise((r) => setTimeout(r, 10));
  }
  const [approvalId] = [...getRun(run.id)!.approvals.keys()];
  assert.ok(resolveApproval(run.id, approvalId, false));
  await waitFor(run.id);
  assert.equal(getRun(run.id)!.summary.status, "completed");
  await store.readFile(meta.id, "main", "src/client/HudController.luau"); // still exists
});

test("invalid tool input is returned to the model, not executed", async () => {
  const meta = await store.createProject({ name: "Invalid Input", kind: "web-app" });
  const provider = scripted([
    () => [{ id: "x1", name: "write_file", input: { path: "a.txt" } }],
    (req) => {
      const last = req.messages[req.messages.length - 1] as { results: { content: string }[] };
      assert.match(last.results[0].content, /INVALID_INPUT/);
      return "ok";
    },
  ]);
  const run = await startRun({ projectId: meta.id, branch: "main", prompt: "x", mode: "chat", providerOverride: provider });
  await waitFor(run.id);
  assert.equal(getRun(run.id)!.summary.status, "completed");
});

test("snapshots, restore and branches", async () => {
  const meta = await store.createProject({ name: "Versions", kind: "web-app" });
  const s1 = (await store.listSnapshots(meta.id, "main"))[0];
  await store.writeFile(meta.id, "main", "src/counter.js", "export const x = 1;\n");
  const s2 = await store.createSnapshot(meta.id, "main", { label: "edit", reason: "manual" });
  assert.notEqual(s1.id, s2.id);
  const same = await store.createSnapshot(meta.id, "main", { label: "noop", reason: "manual" });
  assert.equal(same.id, s2.id, "identical state reuses the snapshot");
  await store.restoreSnapshot(meta.id, "main", s1.id);
  const f = await store.readFile(meta.id, "main", "src/counter.js");
  assert.match(f.data as string, /nextLabel/);
  await store.createBranch(meta.id, "experiment", { snapshot: s2.id });
  const g = await store.readFile(meta.id, "experiment", "src/counter.js");
  assert.equal(g.data, "export const x = 1;\n");
  await assert.rejects(store.readFile(meta.id, "main", "../../etc/passwd"));
  await assert.rejects(store.writeFile(meta.id, "main", "/abs.txt", "x"));
});
