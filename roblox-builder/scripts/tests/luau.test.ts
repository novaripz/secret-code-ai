import { test, assert } from "./harness";
import { parseLuau } from "../../src/core/luau/parser";
import { analyzeLuau } from "../../src/core/luau/analyzer";

const rules = (src: string, ctx: "server" | "client" | "module" = "server") =>
  analyzeLuau(src, ctx, "x.luau").diagnostics.map((d) => d.rule);

test("parses modern Luau: types, generics, interpolation, if-expressions, compound ops, continue", () => {
  const src = `--!strict
type Map<K, V> = { [K]: V }
export type Fn<T...> = (T...) -> ()
local function id<T>(x: T): T return x end
local s = \`a {1 + 2} b {"{"}\`
local y = if s then 1 elseif false then 2 else 3
local z = (y :: any) :: number
z += 1; z //= 2; s ..= "!"
for i = 1, 3 do if i == 2 then continue end end
local t = { a = 1, ["b"] = 2, 3; [4] = function(...) return ... end }
@native local function fast(v: vector) return v end
print(id(t), fast, 0x1F, 0b1010, 1_000, 1e-3)`;
  const r = parseLuau(src);
  assert.equal(r.error, undefined, JSON.stringify(r.error));
});

test("reports syntax errors with positions and helpful messages", () => {
  const cases: [string, RegExp, number][] = [
    ["if x then\nprint(1)\n", /Expected 'end' \(to close 'if' at line 1\)/, 3],
    ["local a != b", /uses '~='/, 1],
    ["x = ", /Expected identifier/, 1],
    ["print('a)", /Unfinished string/, 1],
    ["return 1\nprint(2)", /end of block after 'return'/, 2],
    ["break", /'break' outside of a loop/, 1],
    ["local f = function() continue end", /Incomplete statement|'continue' outside/, 1],
  ];
  for (const [src, re, line] of cases) {
    const e = parseLuau(src).error;
    assert.ok(e, `expected an error for ${JSON.stringify(src)}`);
    assert.match(e!.message, re);
    assert.equal(e!.line, line, src);
  }
});

test("client/server boundary", () => {
  assert.ok(rules(`local p = game:GetService("Players").LocalPlayer`, "server").includes("roblox/client-server"));
  assert.ok(rules(`local ds = game:GetService("DataStoreService")`, "client").includes("roblox/client-server"));
  assert.ok(rules(`local r = game.ReplicatedStorage.E\nr:FireServer()`, "server").includes("roblox/client-server"));
  assert.ok(rules(`local r = game.ReplicatedStorage.E\nr.OnServerEvent:Connect(print)`, "client").includes("roblox/client-server"));
  assert.ok(!rules(`local r = game.ReplicatedStorage.E\nr:FireServer(1)`, "client").includes("roblox/client-server"));
});

test("deprecations come with fixes", () => {
  const d = analyzeLuau(`wait(1)\npart.Touched:connect(print)`, "server", "a.luau").diagnostics;
  const w = d.find((x) => x.rule === "luau/deprecated-global");
  assert.equal(w?.fix?.kind, "text-edits");
  const c = d.find((x) => x.rule === "luau/deprecated-method");
  assert.ok(c?.fix && c.fix.kind === "text-edits" && c.fix.edits[0].text === "Connect");
});

test("unknown service and misspelt globals are errors with suggestions", () => {
  const d = analyzeLuau(`local x = game:GetService("RunServic")\nprnt(1)`, "server", "a.luau").diagnostics;
  assert.ok(d.some((x) => x.rule === "roblox/unknown-service" && /RunService/.test(x.message) && x.severity === "error"));
  assert.ok(d.some((x) => x.rule === "luau/unknown-global" && /print/.test(x.message)));
});

test("remote handler arguments must be validated", () => {
  const bad = `local e = game.ReplicatedStorage.Buy\ne.OnServerEvent:Connect(function(player, amount)\n  print(amount * 2)\nend)`;
  assert.ok(rules(bad).includes("roblox/remote-validation"));
  const good = `local e = game.ReplicatedStorage.Buy\ne.OnServerEvent:Connect(function(player, amount)\n  if typeof(amount) ~= "number" then return end\n  print(amount * 2)\nend)`;
  assert.ok(!rules(good).includes("roblox/remote-validation"));
});

test("busy loops and unguarded DataStore calls", () => {
  assert.ok(rules(`while true do print(1) end`).includes("luau/busy-loop"));
  assert.ok(!rules(`while true do task.wait(1) end`).includes("luau/busy-loop"));
  assert.ok(rules(`local s = game:GetService("DataStoreService"):GetDataStore("x")\nlocal v = s:GetAsync("k")`).includes("roblox/datastore-pcall"));
  assert.ok(!rules(`local s = game:GetService("DataStoreService"):GetDataStore("x")\nlocal ok, v = pcall(function() return s:GetAsync("k") end)`).includes("roblox/datastore-pcall"));
});

test("facts: requires and WaitForChild chains resolve through locals", () => {
  const src = `local RS = game:GetService("ReplicatedStorage")
local Shared = RS:WaitForChild("Shared")
local Net = require(Shared.Net)
local r = Shared:WaitForChild("Remotes"):WaitForChild("Buy")
local c = require(script.Parent.Config)`;
  const f = analyzeLuau(src, "client").facts;
  const req = f.requires.map((r) => `${r.ref.root}:${r.ref.segments.map((s) => s.name).join("/")}`);
  assert.deepEqual(req, ["game:ReplicatedStorage/Shared/Net", "script:../Config"]);
  assert.ok(f.refs.some((r) => r.ref.segments.map((s) => s.name).join("/") === "ReplicatedStorage/Shared/Remotes/Buy"));
});
