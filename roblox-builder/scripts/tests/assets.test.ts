import { test, assert } from "./harness";
import { runAssetPipeline } from "../../src/core/assets/pipeline";
import { inspectMeshFile } from "../../src/core/assets/gltf";
import { robloxTemplate } from "../../src/core/roblox/template";
import { validateRobloxProject } from "../../src/core/roblox/validate";
import { writeRobloxXml } from "../../src/core/roblox/rbxmx";
// @ts-expect-error: no types shipped
import validator from "gltf-validator";

export const TABLE = {
  name: "OakTable",
  category: "furniture",
  description: "A four-legged oak table",
  parts: [
    { name: "Top", shape: "block", size: [6, 0.4, 4], position: [0, 3, 0], color: "#8b5a2b", material: "Wood", texture: { pattern: "planks" } },
    ...[[-2.6, -1.6], [2.6, -1.6], [-2.6, 1.6], [2.6, 1.6]].map(([x, z], i) => ({
      name: `Leg${i + 1}`, shape: "cylinder", size: [2.8, 0.4, 0.4], position: [x, 1.4, z], rotation: [0, 0, 90], color: "#6b4423", material: "Wood", group: "Legs",
    })),
    { name: "Lamp", shape: "sphere", size: [0.6, 0.6, 0.6], position: [0, 3.5, 0], color: "#ffe9a8", material: "Neon", effects: [{ type: "PointLight", range: 10, brightness: 2 }] },
  ],
};

test("asset pipeline produces a Roblox model, metadata and valid glTF/GLB/OBJ", async () => {
  const r = runAssetPipeline(TABLE, { formats: ["glb", "gltf", "obj"] });
  assert.ok(r.ok, JSON.stringify(r.diagnostics));
  assert.deepEqual(r.steps.map((s) => s.step), ["parse", "inspect", "optimize", "validate", "textures", "package", "metadata", "export"]);
  for (const f of ["src/assets/OakTable.model.json", "assets/source/OakTable.glb", "assets/source/OakTable.gltf", "assets/source/OakTable.obj", "assets/source/OakTable.mtl", "assets/source/OakTable.asset.json", "assets/specs/OakTable.spec.json"]) {
    assert.ok(r.files[f], `missing ${f}`);
  }
  assert.ok(Object.keys(r.files).some((f) => f.startsWith("assets/textures/") && f.endsWith(".png")));
  assert.deepEqual(r.stats!.size.map((x) => Math.round(x * 100) / 100), [6, 3.8, 4]);

  const glb = r.files["assets/source/OakTable.glb"] as Uint8Array;
  const report = await validator.validateBytes(glb);
  assert.equal(report.issues.numErrors, 0, JSON.stringify(report.issues.messages.filter((m: { severity: number }) => m.severity === 0).slice(0, 5)));
  const gltfText = r.files["assets/source/OakTable.gltf"] as string;
  const report2 = await validator.validateBytes(new TextEncoder().encode(gltfText));
  assert.equal(report2.issues.numErrors, 0);

  const insp = inspectMeshFile("OakTable.glb", glb);
  assert.ok(insp.ok);
  assert.equal(insp.meshes, 6);
  assert.equal(insp.textures, 1);
});

test("the generated Roblox model drops into a project cleanly and exports with PrimaryPart set", () => {
  const r = runAssetPipeline(TABLE);
  const files = new Map<string, string | Uint8Array>(Object.entries(robloxTemplate("T", "roblox-experience")));
  for (const [k, v] of Object.entries(r.files)) files.set(k, v);
  const v = validateRobloxProject(files);
  const bad = v.diagnostics.filter((d) => d.severity !== "info");
  assert.equal(bad.length, 0, bad.map((d) => d.message).join("; "));
  const table = v.build.root.children.find((c) => c.name === "ReplicatedStorage")!.children.find((c) => c.name === "Assets")!.children[0];
  assert.equal(table.name, "OakTable");
  assert.equal(table.refTargets?.PrimaryPart, "OakTable_0");
  const xml = writeRobloxXml(table).xml;
  assert.match(xml, /<Ref name="PrimaryPart">RBX[0-9A-F]+<\/Ref>/);
  assert.match(xml, /<token name="shape">2<\/token>/); // cylinder legs
});

test("asset validation catches bad specs and implausible scale", () => {
  const bad = runAssetPipeline({ ...TABLE, parts: [{ name: "X", size: [1, 1, 1], position: [0, 0, 0], material: "Wod" }] });
  assert.equal(bad.ok, false);
  assert.match(bad.diagnostics[0].message, /not a Roblox material/);
  const huge = runAssetPipeline({ name: "Chair", category: "furniture", parts: [{ name: "Seat", size: [40, 60, 40], position: [0, 30, 0] }] });
  assert.ok(huge.diagnostics.some((d) => d.rule === "asset/scale"));
});
