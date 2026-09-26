import { test, assert } from "./harness";
import { robloxTemplate } from "../../src/core/roblox/template";
import { validateRobloxProject } from "../../src/core/roblox/validate";
import { applyRepairs, planRepairs } from "../../src/core/roblox/repair";
import { applyHierarchyOps, findNodeByPath } from "../../src/core/roblox/hierarchyEdit";
import { buildDataModel } from "../../src/core/roblox/rojo";
import { parseRbxmx, writeRobloxXml, serializeAttributes } from "../../src/core/roblox/rbxmx";
import { layoutGui } from "../../src/core/roblox/gui";
import { rotationFromOrientation, orientationFromRotation } from "../../src/core/roblox/values";
import type { FileMap } from "../../src/core/project/files";

const tmpl = (): FileMap => new Map(Object.entries(robloxTemplate("Test", "roblox-experience")));

test("every Roblox template validates with no errors or warnings", () => {
  for (const kind of ["roblox-experience", "roblox-ui", "roblox-system", "roblox-plugin", "roblox-asset"] as const) {
    const r = validateRobloxProject(new Map(Object.entries(robloxTemplate("T", kind))));
    const bad = r.diagnostics.filter((d) => d.severity !== "info");
    assert.equal(bad.length, 0, `${kind}: ${bad.map((d) => d.message).join("; ")}`);
  }
});

test("Rojo mapping follows file naming rules", () => {
  const b = buildDataModel(tmpl());
  const main = findNodeByPath(b.root, "ServerScriptService.Server.Main");
  assert.equal(main?.className, "Script");
  assert.equal(findNodeByPath(b.root, "StarterPlayer.StarterPlayerScripts.Client.Main")?.className, "LocalScript");
  assert.equal(findNodeByPath(b.root, "ReplicatedStorage.Shared.Net")?.className, "ModuleScript");
  assert.equal(findNodeByPath(b.root, "ReplicatedStorage.Shared.Remotes.Notify")?.className, "RemoteEvent");
  assert.equal(findNodeByPath(b.root, "StarterGui.HUD.TopBar.Coins")?.className, "TextLabel");
});

test("detects a missing require, a LocalScript that never runs, and a misplaced ScreenGui", () => {
  const files = tmpl();
  files.set("src/server/Broken.server.luau", `local x = require(game:GetService("ServerStorage").Modules.Nope)\nprint(x)`);
  files.set("src/shared/Oops.client.luau", `print("never runs")`);
  files.set("src/workspace/Menu.model.json", JSON.stringify({ ClassName: "ScreenGui" }));
  const r = validateRobloxProject(files);
  const rules = r.diagnostics.map((d) => d.rule);
  assert.ok(rules.includes("roblox/require-missing"));
  assert.ok(rules.includes("roblox/localscript-location"));
  assert.ok(rules.includes("roblox/screengui-location"));
  assert.equal(r.checks.find((c) => c.id === "references")?.status, "fail");
});

test("remote wiring: fired with no listener; wrong remote kind", () => {
  const files = tmpl();
  files.set("src/shared/Remotes.model.json", JSON.stringify({ ClassName: "Folder", Children: [{ Name: "Notify", ClassName: "RemoteEvent" }, { Name: "Buy", ClassName: "RemoteFunction" }] }));
  files.set("src/client/Shop.client.luau", `local RS = game:GetService("ReplicatedStorage")\nRS.Shared.Remotes.Buy:FireServer(1)`);
  const r = validateRobloxProject(files);
  assert.ok(r.diagnostics.some((d) => d.rule === "roblox/remote-kind"));
  assert.ok(r.diagnostics.some((d) => d.rule === "roblox/remote-unhandled"));
});

test("unknown properties and bad values in JSON models are errors", () => {
  const files = tmpl();
  files.set("src/ui/Bad.model.json", JSON.stringify({ ClassName: "ScreenGui", Children: [{ Name: "F", ClassName: "Frame", Properties: { Colour: [1, 0, 0], BackgroundColor3: [255, 0, 0] } }] }));
  const r = validateRobloxProject(files);
  assert.ok(r.diagnostics.some((d) => d.rule === "roblox/unknown-property" && /Colour/.test(d.message)));
  assert.ok(r.diagnostics.some((d) => d.rule === "roblox/property-type" && /0-1/.test(d.message)));
});

test("auto-repair fixes deprecations, script placement and missing remotes, and the result revalidates clean", () => {
  const files = tmpl();
  files.set("src/server/Loop.server.luau", `local RS = game:GetService("ReplicatedStorage")\nlocal remotes = RS:WaitForChild("Shared"):WaitForChild("Remotes")\nremotes:WaitForChild("Ping").OnServerEvent:Connect(function(player)\n  print(player)\nend)\nwhile true do\n  wait(5)\nend`);
  files.set("src/client/Ping.client.luau", `local RS = game:GetService("ReplicatedStorage")\nRS:WaitForChild("Shared"):WaitForChild("Remotes"):WaitForChild("Ping"):FireServer()`);
  files.set("src/shared/Stray.client.luau", `print("hi")`);
  const before = validateRobloxProject(files);
  assert.ok(before.summary.warning + before.summary.error > 0);
  const plan = planRepairs(files, before);
  const res = applyRepairs(files, plan);
  assert.equal(res.failed.length, 0, JSON.stringify(res.failed));
  const after = validateRobloxProject(res.files);
  const left = after.diagnostics.filter((d) => d.severity !== "info");
  assert.equal(left.length, 0, left.map((d) => `${d.rule}: ${d.message}`).join("\n"));
  assert.match(res.files.get("src/server/Loop.server.luau") as string, /task\.wait\(5\)/);
  assert.ok(res.files.has("src/client/Stray.client.luau"));
});

test("hierarchy edits write minimal file changes", () => {
  let files = tmpl();
  const r1 = applyHierarchyOps(files, [
    { op: "add", parent: "StarterGui.HUD.TopBar", className: "TextButton", name: "Shop", properties: { Text: "Shop", Size: [[0, 80], [0, 32]] } },
    { op: "set", path: "StarterGui.HUD.TopBar.Title", properties: { TextSize: 24 } },
    { op: "add", parent: "ReplicatedStorage.Shared", className: "ModuleScript", name: "Util", properties: { Source: "return {}" } },
    { op: "rename", path: "ReplicatedStorage.Shared.Util", name: "Utils" },
  ]);
  files = r1.files;
  assert.ok(files.has("src/shared/Utils.luau"));
  const b = buildDataModel(files);
  assert.equal(findNodeByPath(b.root, "StarterGui.HUD.TopBar.Shop")?.className, "TextButton");
  const title = findNodeByPath(b.root, "StarterGui.HUD.TopBar.Title");
  assert.deepEqual(title?.properties.TextSize, { t: "float", v: 24 });
  assert.throws(() => applyHierarchyOps(files, [{ op: "set", path: "StarterGui.HUD.TopBar", properties: { Nope: 1 } }]), /no property "Nope"/);
  const r2 = applyHierarchyOps(files, [{ op: "move", path: "StarterGui.HUD.TopBar.Shop", newParent: "StarterGui.HUD" }]);
  assert.ok(findNodeByPath(buildDataModel(r2.files).root, "StarterGui.HUD.Shop"));
  const r3 = applyHierarchyOps(r2.files, [{ op: "remove", path: "StarterGui.HUD.Shop" }]);
  assert.equal(findNodeByPath(buildDataModel(r3.files).root, "StarterGui.HUD.Shop"), undefined);
});

test("rbxlx export round-trips through the XML reader", () => {
  const b = buildDataModel(tmpl());
  const { xml, warnings } = writeRobloxXml(b.root, { place: true });
  assert.deepEqual(warnings, []);
  const parsed = parseRbxmx(xml);
  assert.equal(parsed.error, undefined);
  const ws = parsed.roots.find((r) => r.className === "Workspace");
  const base = ws?.children[0]?.children.find((c) => c.name === "Baseplate");
  assert.deepEqual(base?.properties.Size, { t: "Vector3", v: [512, 4, 512] });
  assert.equal(base?.properties.Material?.t === "Enum" && base.properties.Material.v, "Concrete");
  const hud = parsed.roots.find((r) => r.className === "StarterGui")?.children[0];
  assert.equal(hud?.className, "ScreenGui");
  assert.ok(xml.includes("<![CDATA[--!strict"));
});

test("attribute blob encodes strings, bools and numbers", () => {
  const bytes = serializeAttributes({ A: { t: "string", v: "hi" }, B: { t: "bool", v: true }, C: { t: "float", v: 1.5 } });
  const dv = new DataView(bytes.buffer);
  assert.equal(dv.getUint32(0, true), 3);
  assert.equal(bytes[4 + 4 + 1], 0x02);
});

test("CFrame orientation round-trips", () => {
  for (const o of [[0, 90, 0], [30, 45, -10], [-20, 0, 60]] as [number, number, number][]) {
    const back = orientationFromRotation(rotationFromOrientation(o));
    back.forEach((v, i) => assert.ok(Math.abs(v - o[i]) < 1e-3, `${o} -> ${back}`));
  }
});

test("GUI layout honours anchor points, padding and list layouts", () => {
  const b = buildDataModel(tmpl());
  const hud = findNodeByPath(b.root, "StarterGui.HUD")!;
  const box = layoutGui(hud, { w: 1280, h: 720 });
  const bar = box.children[0];
  assert.equal(bar.w, 360);
  assert.equal(bar.x, (1280 - 360) / 2);
  assert.equal(bar.y, 58 + 12);
  const [title, coins] = bar.children;
  assert.equal(title.x, bar.x + 16);
  assert.ok(coins.x > title.x + title.w);
  assert.ok(title.laidOut && coins.laidOut);
});
