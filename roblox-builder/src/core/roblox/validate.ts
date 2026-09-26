// The Roblox compatibility check.
//
// Builds the DataModel exactly as Rojo would, analyzes every script in the
// context it will actually run in, and then checks the things that only show
// up when you look at the whole project at once: requires that point at
// nothing, WaitForChild calls that will yield forever, remotes fired with no
// listener, server secrets replicated to clients, LocalScripts in places
// they never run, GUIs that will never render, and malformed asset ids.

import { countBySeverity, sortDiagnostics, type Diagnostic, type Severity } from "../diagnostics";
import { analyzeLuau, formatRef, type InstanceRef, type ScriptFacts } from "../luau/analyzer";
import { SERVICES } from "../luau/globals";
import type { FileMap } from "../project/files";
import { allProps, getClass, isA, propType } from "./classes";
import { dottedPath, indexTree, walk, type RNode } from "./instance";
import { buildDataModel, scriptContextOf, type DataModelBuild } from "./rojo";
import { auditScreenGui } from "./uiAudit";

export type CheckStatus = "pass" | "warn" | "fail";

export interface CheckGroup {
  id: string;
  label: string;
  status: CheckStatus;
  errors: number;
  warnings: number;
}

export interface ValidationReport {
  diagnostics: Diagnostic[];
  checks: CheckGroup[];
  stats: { instances: number; scripts: number; remotes: number; guis: number; parts: number; modules: number };
  build: DataModelBuild;
  facts: Map<string, ScriptFacts>;
  summary: Record<Severity, number>;
}

const CHECK_GROUPS: { id: string; label: string; categories: Diagnostic["category"][] }[] = [
  { id: "project", label: "Project structure (Rojo)", categories: ["project"] },
  { id: "syntax", label: "Luau syntax", categories: ["syntax"] },
  { id: "scripts", label: "Script correctness", categories: ["script", "deprecated", "performance"] },
  { id: "client-server", label: "Client/server boundary", categories: ["client-server"] },
  { id: "remotes", label: "Remotes & security", categories: ["remote", "security"] },
  { id: "hierarchy", label: "Instance hierarchy", categories: ["hierarchy"] },
  { id: "references", label: "References & dependencies", categories: ["reference", "dependency"] },
  { id: "properties", label: "Properties & naming", categories: ["property", "naming"] },
  { id: "ui", label: "UI", categories: ["ui"] },
  { id: "assets", label: "Assets", categories: ["asset"] },
];

/** Methods and events every Instance (and Model) has, which dot access can legitimately reach. */
const INSTANCE_MEMBERS = new Set([
  "ClearAllChildren", "Clone", "Destroy", "FindFirstAncestor", "FindFirstAncestorOfClass", "FindFirstAncestorWhichIsA",
  "FindFirstChild", "FindFirstChildOfClass", "FindFirstChildWhichIsA", "FindFirstDescendant", "GetActor", "GetAttribute",
  "GetAttributeChangedSignal", "GetAttributes", "GetChildren", "GetDescendants", "GetFullName", "GetPropertyChangedSignal",
  "GetTags", "HasTag", "AddTag", "RemoveTag", "IsA", "IsAncestorOf", "IsDescendantOf", "SetAttribute", "WaitForChild",
  "GetPivot", "PivotTo", "GetBoundingBox", "GetExtentsSize", "GetScale", "ScaleTo", "MoveTo", "TranslateBy",
  "AncestryChanged", "AttributeChanged", "Changed", "ChildAdded", "ChildRemoved", "DescendantAdded", "DescendantRemoving", "Destroying",
]);

/** Containers whose children only exist at runtime; references into them cannot be checked statically. */
const RUNTIME_CONTAINERS = new Set(["Players", "Backpack", "PlayerGui", "PlayerScripts", "Camera", "Terrain", "Debris"]);

/** Where a LocalScript actually runs. */
const LOCALSCRIPT_HOSTS = ["StarterPlayerScripts", "StarterCharacterScripts", "StarterGui", "StarterPack", "ReplicatedFirst"];
/** Where a legacy server Script actually runs. */
const SCRIPT_HOSTS = ["ServerScriptService", "Workspace"];
/** Containers every client can read. */
const REPLICATED = ["ReplicatedStorage", "ReplicatedFirst", "StarterGui", "StarterPack", "StarterPlayer", "Workspace", "Lighting", "SoundService", "Teams"];
const SERVER_ONLY_CONTAINERS = ["ServerScriptService", "ServerStorage"];

export function validateRobloxProject(files: FileMap, projectFile?: string): ValidationReport {
  const build = buildDataModel(files, projectFile);
  const diagnostics: Diagnostic[] = [...build.diagnostics];
  const { byId, parentOf } = indexTree(build.root);
  const facts = new Map<string, ScriptFacts>();
  const stats = { instances: 0, scripts: 0, remotes: 0, guis: 0, parts: 0, modules: 0 };

  const ancestors = (n: RNode): RNode[] => {
    const out: RNode[] = [];
    for (let p = parentOf.get(n.id); p; p = parentOf.get(p.id)) out.push(p);
    return out;
  };
  const serviceOf = (n: RNode): string | undefined => {
    const chain = [n, ...ancestors(n)];
    const top = chain[chain.length - 2]; // child of the DataModel
    return top?.className === "DataModel" ? undefined : top?.className;
  };
  const underClass = (n: RNode, cls: string) => ancestors(n).some((a) => a.className === cls || isA(a.className, cls));

  // ------------------------------------------------------------ scripts
  walk(build.root, (n) => {
    stats.instances++;
    if (n.className === "Script" || n.className === "LocalScript" || n.className === "ModuleScript") {
      stats.scripts++;
      if (n.className === "ModuleScript") stats.modules++;
      if (n.source === undefined || n.opaque) return;
      const file = n.origin?.file;
      // Generated .json modules are Rojo's own output; do not lint them.
      if (file && /\.(json|toml)$/.test(file)) return;
      const result = analyzeLuau(n.source, scriptContextOf(n), file);
      diagnostics.push(...result.diagnostics.map((d) => ({ ...d, instancePath: n.id })));
      facts.set(n.id, result.facts);
    }
    if (getClass(n.className)?.category === "remote") stats.remotes++;
    if (isA(n.className, "GuiObject") || isA(n.className, "LayerCollector")) stats.guis++;
    if (isA(n.className, "BasePart")) stats.parts++;
  });

  // ------------------------------------------------------------ hierarchy
  const push = (d: Omit<Diagnostic, "file"> & { node?: RNode }) => {
    const { node, ...rest } = d;
    diagnostics.push({ ...rest, file: node?.origin?.file, instancePath: node?.id ?? rest.instancePath });
  };

  walk(build.root, (n, parent) => {
    const cls = getClass(n.className);
    const service = serviceOf(n);
    const path = dottedPath(n.id);

    if (parent?.className === "DataModel" && n.className !== "Folder" && !cls?.service && n.className !== "DataModel") {
      push({
        rule: "roblox/root-non-service",
        severity: "error",
        category: "hierarchy",
        message: `${path} is a ${n.className} at the top of the place; only services can live there`,
        node: n,
      });
    }
    if (cls?.service && parent && parent.className !== "DataModel") {
      push({ rule: "roblox/nested-service", severity: "error", category: "hierarchy", message: `${n.className} is a service and cannot be parented under ${parent.className}`, node: n });
    }
    if ((n.className === "StarterPlayerScripts" || n.className === "StarterCharacterScripts") && parent?.className !== "StarterPlayer") {
      push({ rule: "roblox/starter-scripts-parent", severity: "error", category: "hierarchy", message: `${n.className} must be a child of StarterPlayer`, node: n });
    }

    // Names.
    if (!n.name.trim()) {
      push({ rule: "roblox/empty-name", severity: "error", category: "naming", message: `A ${n.className} has an empty name`, node: n });
    } else if (n.name.length > 100) {
      push({ rule: "roblox/long-name", severity: "warning", category: "naming", message: `"${n.name.slice(0, 30)}…" is over 100 characters; Roblox truncates names`, node: n });
    } else if (/[./\\]/.test(n.name) && n.className !== "DataModel") {
      push({
        rule: "roblox/name-dot",
        severity: "warning",
        category: "naming",
        message: `"${n.name}" contains '.', '/' or '\\'; it can only be reached with FindFirstChild, not dot indexing`,
        node: n,
      });
    }
    if (parent && n.className !== "DataModel") {
      const dupes = parent.children.filter((c) => c.name === n.name);
      if (dupes.length > 1 && dupes[0] === n) {
        push({
          rule: "roblox/duplicate-sibling",
          severity: "warning",
          category: "naming",
          message: `${dottedPath(parent.id)} has ${dupes.length} children named "${n.name}"; code that finds it by name gets an arbitrary one`,
          node: n,
        });
      }
      if (parent.className !== "DataModel" && propType(parent.className, n.name) && getClass(parent.className)) {
        push({
          rule: "roblox/child-shadows-property",
          severity: "warning",
          category: "naming",
          message: `Child "${n.name}" has the same name as a ${parent.className} property; ${dottedPath(parent.id)}.${n.name} returns the property, not the child`,
          node: n,
        });
      }
    }

    // Scripts that never run.
    if (n.className === "LocalScript") {
      const runs = [n, ...ancestors(n)].some((a) => LOCALSCRIPT_HOSTS.includes(a.className)) || underClass(n, "Tool");
      const rc = n.properties.RunContext;
      if (!runs && !(rc?.t === "Enum" && rc.v === "Client")) {
        push({
          rule: "roblox/localscript-location",
          severity: "error",
          category: "hierarchy",
          message: `LocalScript ${path} will never run: LocalScripts only run under StarterPlayerScripts, StarterCharacterScripts, StarterGui, StarterPack (in a Tool) or ReplicatedFirst`,
          node: n,
        });
      }
    }
    if (n.className === "Script") {
      const rc = n.properties.RunContext;
      const ctx = rc?.t === "Enum" ? rc.v : "Legacy";
      if (ctx === "Legacy") {
        const runs = [n, ...ancestors(n)].some((a) => SCRIPT_HOSTS.includes(a.className));
        if (!runs) {
          push({
            rule: "roblox/script-location",
            severity: "error",
            category: "hierarchy",
            message: `Script ${path} will never run: server Scripts only run under ServerScriptService or Workspace (or set RunContext to Server)`,
            node: n,
          });
        }
      }
      if (ctx === "Server" && service && REPLICATED.includes(service)) {
        push({
          rule: "roblox/server-script-replicated",
          severity: "warning",
          category: "security",
          message: `Server Script ${path} lives in ${service}, so its source is sent to every client`,
          node: n,
        });
      }
    }

    // GUIs.
    if (isA(n.className, "GuiObject")) {
      const collector = ancestors(n).find((a) => isA(a.className, "LayerCollector") || a.className === "ViewportFrame");
      if (!collector && (service === "StarterGui" || service === "Workspace")) {
        push({
          rule: "roblox/gui-no-root",
          severity: "error",
          category: "ui",
          message: `${n.className} ${path} is not inside a ScreenGui, BillboardGui or SurfaceGui, so it will never be drawn`,
          node: n,
        });
      }
    }
    if (n.className === "ScreenGui" && service && !["StarterGui", "ReplicatedStorage", "ServerStorage", "ReplicatedFirst"].includes(service)) {
      push({
        rule: "roblox/screengui-location",
        severity: "error",
        category: "ui",
        message: `ScreenGui ${path} is in ${service}; ScreenGuis only display from StarterGui (copied into PlayerGui)`,
        node: n,
      });
    }
    if (isA(n.className, "UIComponent") && parent && !isA(parent.className, "GuiObject") && !isA(parent.className, "LayerCollector")) {
      push({
        rule: "roblox/ui-component-parent",
        severity: "warning",
        category: "ui",
        message: `${n.className} has no effect under a ${parent.className}; parent it to a GUI object`,
        node: n,
      });
    }
    if (isA(n.className, "GuiObject") || isA(n.className, "LayerCollector")) {
      const layouts = n.children.filter((c) => isA(c.className, "UIGridStyleLayout"));
      if (layouts.length > 1) {
        push({
          rule: "roblox/multiple-layouts",
          severity: "warning",
          category: "ui",
          message: `${path} has ${layouts.length} layout objects (${layouts.map((l) => l.className).join(", ")}); only one takes effect`,
          node: n,
        });
      }
      const size = n.properties.Size;
      const auto = n.properties.AutomaticSize;
      const parentLayout = parent?.children.some((c) => isA(c.className, "UIGridLayout"));
      if (isA(n.className, "GuiObject") && size?.t === "UDim2" && size.v.every((x) => x === 0) && !(auto?.t === "Enum" && auto.v !== "None") && !parentLayout) {
        push({ rule: "roblox/zero-size", severity: "warning", category: "ui", message: `${path} has Size 0,0,0,0 and will be invisible`, node: n });
      }
      const pos = n.properties.Position;
      if (pos?.t === "UDim2" && (pos.v[0] > 1.05 || pos.v[2] > 1.05 || pos.v[0] < -0.5 || pos.v[2] < -0.5)) {
        push({ rule: "roblox/offscreen", severity: "warning", category: "ui", message: `${path} is positioned outside its parent (Position ${pos.v.join(", ")})`, node: n });
      }
      if (n.properties.TextScaled?.t === "bool" && n.properties.TextScaled.v && !n.children.some((c) => c.className === "UITextSizeConstraint")) {
        push({
          rule: "roblox/textscaled-constraint",
          severity: "info",
          category: "ui",
          message: `${path} uses TextScaled without a UITextSizeConstraint; text can become huge on large screens`,
          node: n,
        });
      }
      if ((n.className === "ImageLabel" || n.className === "ImageButton") && !(n.properties.Image?.t === "Content" && n.properties.Image.v)) {
        push({ rule: "roblox/image-empty", severity: "warning", category: "asset", message: `${path} has no Image set`, node: n });
      }
    }

    // Physical objects that need a physical parent.
    const needsPart: Record<string, string> = {
      Attachment: "a BasePart",
      Decal: "a BasePart",
      Texture: "a BasePart",
      SurfaceAppearance: "a MeshPart",
      PointLight: "a BasePart or Attachment",
      SpotLight: "a BasePart or Attachment",
      SurfaceLight: "a BasePart",
      Fire: "a BasePart or Attachment",
      Smoke: "a BasePart or Attachment",
      Sparkles: "a BasePart or Attachment",
      ParticleEmitter: "a BasePart or Attachment",
      ClickDetector: "a BasePart or Model",
      ProximityPrompt: "a BasePart, Attachment or Model",
    };
    const need = needsPart[n.className];
    if (need && parent) {
      const ok =
        isA(parent.className, "BasePart") ||
        (need.includes("Attachment") && isA(parent.className, "Attachment")) ||
        (need.includes("Model") && isA(parent.className, "Model")) ||
        (n.className === "Attachment" && isA(parent.className, "Attachment"));
      const inStorage = service === "ReplicatedStorage" || service === "ServerStorage";
      if (!ok && !(inStorage && parent.className === "Folder")) {
        push({
          rule: "roblox/physical-parent",
          severity: n.className === "Attachment" ? "error" : "warning",
          category: "hierarchy",
          message: `${n.className} ${path} is under a ${parent.className}; it only works under ${need}`,
          node: n,
        });
      }
    }
    if (["Atmosphere", "Sky", "BloomEffect", "ColorCorrectionEffect", "SunRaysEffect", "BlurEffect", "DepthOfFieldEffect"].includes(n.className)) {
      if (parent && parent.className !== "Lighting" && parent.className !== "Camera") {
        push({ rule: "roblox/lighting-parent", severity: "warning", category: "hierarchy", message: `${n.className} only has an effect under Lighting (or the Camera)`, node: n });
      }
    }
    if (n.className === "Team" && parent?.className !== "Teams") {
      push({ rule: "roblox/team-parent", severity: "warning", category: "hierarchy", message: `Team ${path} must be under the Teams service`, node: n });
    }
    if (n.className === "Tool") {
      const requiresHandle = n.properties.RequiresHandle?.t === "bool" ? n.properties.RequiresHandle.v : true;
      if (requiresHandle && !n.children.some((c) => c.name === "Handle" && isA(c.className, "BasePart"))) {
        push({
          rule: "roblox/tool-handle",
          severity: "error",
          category: "hierarchy",
          message: `Tool ${path} requires a handle but has no BasePart child named "Handle"; set RequiresHandle to false or add one`,
          node: n,
        });
      }
    }
    if (n.className === "WeldConstraint" || n.className === "Weld" || n.className === "Motor6D") {
      const refs = { ...n.refTargets };
      const has = (p: string) => refs[p] || (n.properties[p]?.t === "Ref" && (n.properties[p] as { v: string | null }).v);
      if (!has("Part0") || !has("Part1")) {
        push({
          rule: "roblox/weld-parts",
          severity: "warning",
          category: "hierarchy",
          message: `${n.className} ${path} does not set both Part0 and Part1 in the project; it welds nothing unless a script sets them`,
          node: n,
        });
      }
    }

    // Parts.
    if (isA(n.className, "BasePart")) {
      const size = n.properties.Size;
      if (size?.t === "Vector3") {
        if (size.v.some((x) => x > 2048)) {
          push({ rule: "roblox/part-too-large", severity: "error", category: "property", message: `${path} Size ${size.v.join(", ")} exceeds the 2048-stud limit per axis`, node: n });
        }
        if (size.v.some((x) => x <= 0)) {
          push({ rule: "roblox/part-size", severity: "error", category: "property", message: `${path} has a zero or negative Size component`, node: n });
        } else if (size.v.some((x) => x < 0.001)) {
          push({ rule: "roblox/part-tiny", severity: "warning", category: "property", message: `${path} is thinner than 0.001 studs, the smallest Roblox allows`, node: n });
        }
      }
      if ((n.properties.Position || n.properties.Orientation) && n.origin?.file.endsWith(".json")) {
        push({
          rule: "roblox/derived-property",
          severity: "info",
          category: "property",
          message: `${path} sets Position/Orientation; these are views of CFrame. Exports convert them, but CFrame is the canonical property`,
          node: n,
        });
      }
      if (service === "Workspace" && n.properties.Anchored?.t !== "bool" && !underClass(n, "Tool")) {
        // Parts default to unanchored and will fall; flag only structural-looking parts.
        const hasConstraint = n.children.some((c) => /Weld|Constraint|Motor6D/.test(c.className)) || ancestors(n).some((a) => a.children.some((c) => /Weld|Motor6D/.test(c.className)));
        if (!hasConstraint) {
          push({
            rule: "roblox/unanchored",
            severity: "info",
            category: "property",
            message: `${path} is not anchored and has no welds; it will fall when the game starts`,
            node: n,
          });
        }
      }
    }

    // Asset ids.
    for (const [prop, v] of Object.entries(n.properties)) {
      if (v.t !== "Content") continue;
      const problem = contentProblem(v.v);
      if (problem) {
        push({
          rule: problem.placeholder ? "roblox/asset-placeholder" : "roblox/asset-id",
          severity: problem.placeholder ? "warning" : "error",
          category: "asset",
          message: `${path}.${prop}: ${problem.message}`,
          node: n,
        });
      }
    }
    if (n.className === "Sound" && !(n.properties.SoundId?.t === "Content" && n.properties.SoundId.v)) {
      push({ rule: "roblox/sound-empty", severity: "warning", category: "asset", message: `Sound ${path} has no SoundId`, node: n });
    }
    if (n.className === "MeshPart" && !(n.properties.MeshId?.t === "Content" && n.properties.MeshId.v)) {
      push({
        rule: "roblox/meshpart-no-mesh",
        severity: "warning",
        category: "asset",
        message: `MeshPart ${path} has no MeshId. Import the mesh with Studio's 3D Importer (or upload it) and set MeshId`,
        node: n,
      });
    }

    if (n.opaque) {
      push({
        rule: "roblox/opaque-model",
        severity: "info",
        category: "asset",
        message: `${path} comes from a binary .rbxm; its contents cannot be inspected or validated here`,
        node: n,
      });
    }

    // Unknown class names used in the tree.
    if (n.className !== "DataModel" && !getClass(n.className) && !n.opaque) {
      // Already reported by rojo.ts for model/project files.
    }
  });

  // ------------------------------------------------------------ references
  const created = collectCreated(build.root, byId, parentOf, facts);
  for (const [scriptId, f] of facts) {
    const script = byId.get(scriptId);
    if (!script) continue;
    const ctx = scriptContextOf(script);
    const file = script.origin?.file;

    const check = (ref: InstanceRef, via: string, loc: { start: { line: number; col: number } }) => {
      const res = resolveRef(ref, script, byId, parentOf, build.root, created);
      const at = { file, line: loc.start.line, col: loc.start.col, instancePath: scriptId };
      if (res.kind === "missing") {
        const pretty = formatRef(ref);
        const isPackage = ref.segments.some((s) => s.name === "Packages");
        if (via === "require") {
          diagnostics.push({
            rule: isPackage ? "roblox/missing-package" : "roblox/require-missing",
            severity: "error",
            category: isPackage ? "dependency" : "reference",
            message: isPackage
              ? `require(${pretty}): the Packages folder is not in the project. Add the dependency (e.g. wally install) and map Packages in the Rojo project`
              : `require(${pretty}): "${res.missing}" does not exist under ${dottedPath(res.at.id)}`,
            ...at,
          });
        } else if (via === "WaitForChild") {
          diagnostics.push({
            rule: "roblox/waitforchild-missing",
            severity: "warning",
            category: "reference",
            message: `${pretty}: nothing named "${res.missing}" exists under ${dottedPath(res.at.id)} and no script creates it; WaitForChild will yield forever`,
            ...at,
          });
        } else if (via === "index") {
          // Only plain containers: services and GUI objects have methods and
          // events this database does not list, so a miss there proves nothing.
          const containerLike = ["Folder", "Model", "Configuration"].includes(res.at.className);
          if (containerLike && !allProps(res.at.className)[res.missing] && !INSTANCE_MEMBERS.has(res.missing)) {
            diagnostics.push({
              rule: "roblox/index-missing",
              severity: "error",
              category: "reference",
              message: `${pretty}: "${res.missing}" is not a valid member of ${res.at.className} "${dottedPath(res.at.id)}"`,
              ...at,
            });
          }
        }
        return res;
      }
      if (res.kind === "found") {
        const target = res.node;
        const targetService = serviceOf(target);
        if (ctx === "client" && targetService && SERVER_ONLY_CONTAINERS.includes(targetService)) {
          diagnostics.push({
            rule: "roblox/client-reads-server",
            severity: "error",
            category: "client-server",
            message: `${formatRef(ref)} is in ${targetService}, which does not replicate to clients; this LocalScript will not find it`,
            ...at,
          });
        }
        if (via === "require" && target.className !== "ModuleScript" && !target.opaque) {
          diagnostics.push({
            rule: "roblox/require-not-module",
            severity: "error",
            category: "reference",
            message: `require(${formatRef(ref)}) targets a ${target.className}; only ModuleScripts can be required`,
            ...at,
          });
        }
        if (ctx === "client" && ref.root === "game" && ref.segments[0]?.name === "StarterGui" && ref.segments.length > 1) {
          diagnostics.push({
            rule: "roblox/client-startergui",
            severity: "warning",
            category: "ui",
            message: `${formatRef(ref)} is the StarterGui template, not what the player sees; use Players.LocalPlayer.PlayerGui`,
            ...at,
          });
        }
      }
      return res;
    };

    for (const r of f.requires) check(r.ref, "require", r.loc);
    // Only report the deepest reference of each chain, not every prefix of it.
    const refs = dedupePrefixes(f.refs);
    for (const r of refs) check(r.ref, r.via, r.loc);

    // Remote calls on the wrong kind of object.
    for (const rc of f.remoteCalls) {
      if (!rc.ref) continue;
      const res = resolveRef(rc.ref, script, byId, parentOf, build.root, created);
      if (res.kind !== "found") continue;
      const cls = res.node.className;
      const wantsEvent = ["FireServer", "FireClient", "FireAllClients", "OnServerEvent", "OnClientEvent"].includes(rc.member);
      const wantsFunction = ["InvokeServer", "InvokeClient", "OnServerInvoke", "OnClientInvoke"].includes(rc.member);
      if ((wantsEvent && !/RemoteEvent$/.test(cls)) || (wantsFunction && cls !== "RemoteFunction")) {
        diagnostics.push({
          rule: "roblox/remote-kind",
          severity: "error",
          category: "remote",
          message: `${rc.member} is used on ${dottedPath(res.node.id)}, which is a ${cls}${wantsEvent ? "; it must be a RemoteEvent" : "; it must be a RemoteFunction"}`,
          file,
          line: rc.loc.start.line,
          col: rc.loc.start.col,
          instancePath: scriptId,
        });
      }
    }

    // Server-only APIs in modules that clients can see.
    if (ctx === "module") {
      const svc = serviceOf(script);
      const serverUses = [...new Set(f.serverOnlyUses)];
      if (svc && REPLICATED.includes(svc) && serverUses.some((u) => /DataStore|ServerStorage|ServerScriptService|MessagingService|MemoryStore|HttpService:/.test(u))) {
        diagnostics.push({
          rule: "roblox/server-module-replicated",
          severity: "warning",
          category: "security",
          message: `ModuleScript ${dottedPath(scriptId)} uses server-only APIs (${serverUses.slice(0, 3).join(", ")}) but lives in ${svc}, so every client can read its source. Move it to ServerScriptService or ServerStorage`,
          file,
          instancePath: scriptId,
        });
      }
    }
  }

  // Modules required by clients that use server-only APIs.
  for (const [scriptId, f] of facts) {
    const script = byId.get(scriptId);
    if (!script || scriptContextOf(script) !== "client") continue;
    for (const r of f.requires) {
      const res = resolveRef(r.ref, script, byId, parentOf, build.root, created);
      if (res.kind !== "found") continue;
      const modFacts = facts.get(res.node.id);
      const bad = modFacts?.serverOnlyUses.find((u) => /DataStore|ServerStorage|ServerScriptService|MessagingService|MemoryStore|GetDataStore/.test(u));
      if (bad) {
        diagnostics.push({
          rule: "roblox/client-requires-server-module",
          severity: "error",
          category: "client-server",
          message: `This LocalScript requires ${dottedPath(res.node.id)}, which uses ${bad}; that fails on the client`,
          file: script.origin?.file,
          line: r.loc.start.line,
          col: r.loc.start.col,
          instancePath: scriptId,
        });
      }
    }
  }

  // ------------------------------------------------------------ remote wiring
  diagnostics.push(...checkRemoteWiring(build.root, facts, byId));

  // ------------------------------------------------------------ UI at real screen sizes
  const starterGui = build.root.children.find((c) => c.className === "StarterGui");
  for (const gui of starterGui?.children ?? []) {
    if (gui.className === "ScreenGui") diagnostics.push(...auditScreenGui(gui));
  }

  const sorted = sortDiagnostics(dedupe(diagnostics));
  const checks = CHECK_GROUPS.map((g) => {
    const inGroup = sorted.filter((d) => g.categories.includes(d.category));
    const errors = inGroup.filter((d) => d.severity === "error").length;
    const warnings = inGroup.filter((d) => d.severity === "warning").length;
    return { id: g.id, label: g.label, errors, warnings, status: (errors ? "fail" : warnings ? "warn" : "pass") as CheckStatus };
  });
  return { diagnostics: sorted, checks, stats, build, facts, summary: countBySeverity(sorted) };
}

function dedupe(diags: Diagnostic[]): Diagnostic[] {
  const seen = new Set<string>();
  return diags.filter((d) => {
    const k = `${d.rule}|${d.file}|${d.line}|${d.col}|${d.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function dedupePrefixes<T extends { ref: InstanceRef; loc: { start: { line: number; col: number } } }>(refs: T[]): T[] {
  const key = (r: InstanceRef) => `${r.root}/${r.segments.map((s) => s.name).join("/")}`;
  const keys = refs.map((r) => key(r.ref));
  return refs.filter((r, i) => {
    const k = keys[i];
    // Drop a ref if a longer ref at the same source position extends it.
    return !refs.some((o, j) => j !== i && o.loc.start.line === r.loc.start.line && keys[j].startsWith(`${k}/`));
  });
}

export function contentProblem(url: string): { message: string; placeholder: boolean } | undefined {
  if (!url) return undefined;
  if (/^rbxassetid:\/\/0*$/.test(url) || /^rbxassetid:\/\/(TODO|PLACEHOLDER|xxx)/i.test(url)) {
    return { message: `"${url}" is a placeholder; upload the asset and put its real id here`, placeholder: true };
  }
  if (/^rbxassetid:\/\/\d+$/.test(url)) return undefined;
  if (/^rbxasset:\/\/[\w/.-]+$/.test(url)) return undefined;
  if (/^rbxthumb:\/\//.test(url)) return undefined;
  if (/^(https?:\/\/)?www\.roblox\.com\/asset\/\?id=\d+$/.test(url)) return undefined;
  if (/^https?:\/\//.test(url)) {
    return { message: `"${url}" is an external URL; Roblox only loads assets uploaded to Roblox (rbxassetid://<id>)`, placeholder: false };
  }
  return { message: `"${url}" is not a valid asset id; use rbxassetid://<number>`, placeholder: false };
}

// ------------------------------------------------------------ reference resolution

type Resolution = { kind: "found"; node: RNode } | { kind: "missing"; at: RNode; missing: string } | { kind: "unknown" };

interface CreatedIndex {
  /** Parent id -> names created under it at runtime. `*` means any name. */
  names: Map<string, Set<string>>;
}

function collectCreated(root: RNode, byId: Map<string, RNode>, parentOf: Map<string, RNode>, facts: Map<string, ScriptFacts>): CreatedIndex {
  const names = new Map<string, Set<string>>();
  for (const [scriptId, f] of facts) {
    const script = byId.get(scriptId);
    if (!script) continue;
    for (const c of f.created) {
      if (!c.parent) continue;
      const res = resolveRef(c.parent, script, byId, parentOf, root, { names: new Map() });
      if (res.kind !== "found") continue;
      const set = names.get(res.node.id) ?? new Set();
      set.add(c.dynamicName || !c.name ? "*" : c.name);
      names.set(res.node.id, set);
    }
  }
  return { names };
}

function resolveRef(
  ref: InstanceRef,
  script: RNode,
  byId: Map<string, RNode>,
  parentOf: Map<string, RNode>,
  root: RNode,
  created: CreatedIndex,
): Resolution {
  let cur: RNode | undefined = ref.root === "script" ? script : root;
  for (let i = 0; i < ref.segments.length; i++) {
    const seg = ref.segments[i];
    if (!cur) return { kind: "unknown" };
    if (cur.opaque) return { kind: "unknown" };
    if (seg.mode === "parent") {
      cur = parentOf.get(cur.id);
      if (!cur) return { kind: "unknown" };
      continue;
    }
    if (RUNTIME_CONTAINERS.has(cur.className) || RUNTIME_CONTAINERS.has(cur.name)) return { kind: "unknown" };
    const child: RNode | undefined = cur.children.find((c) => c.name === seg.name);
    if (child) {
      cur = child;
      continue;
    }
    if (cur.className === "DataModel") {
      // A service the project does not define (RunService, Players, ...) exists at runtime.
      if (SERVICES.has(seg.name)) return { kind: "unknown" };
      return { kind: "missing", at: cur, missing: seg.name };
    }
    const made = created.names.get(cur.id);
    if (made && (made.has("*") || made.has(seg.name))) return { kind: "unknown" };
    // A soft `.Name` access that is really a property is not a child lookup.
    if (seg.mode === "soft" && propType(cur.className, seg.name)) return { kind: "unknown" };
    // Characters, tools picked up, etc. live in Workspace at runtime.
    if (cur.className === "Workspace" && seg.mode !== "soft") return { kind: "unknown" };
    return { kind: "missing", at: cur, missing: seg.name };
  }
  return cur ? { kind: "found", node: cur } : { kind: "unknown" };
}

function checkRemoteWiring(root: RNode, facts: Map<string, ScriptFacts>, byId: Map<string, RNode>): Diagnostic[] {
  const out: Diagnostic[] = [];
  const uses = new Map<string, Set<string>>();
  const firstUse = new Map<string, { file?: string; line: number; id: string }>();
  for (const [scriptId, f] of facts) {
    for (const rc of f.remoteCalls) {
      if (!rc.name) continue;
      const set = uses.get(rc.name) ?? new Set();
      set.add(rc.member);
      uses.set(rc.name, set);
      if (!firstUse.has(`${rc.name}:${rc.member}`)) {
        firstUse.set(`${rc.name}:${rc.member}`, { file: byId.get(scriptId)?.origin?.file, line: rc.loc.start.line, id: scriptId });
      }
    }
  }
  const pairs: [string[], string, string][] = [
    [["FireServer"], "OnServerEvent", "the server never listens (no .OnServerEvent:Connect)"],
    [["InvokeServer"], "OnServerInvoke", "no server script sets .OnServerInvoke, so the call errors"],
    [["FireClient", "FireAllClients"], "OnClientEvent", "no LocalScript listens (no .OnClientEvent:Connect)"],
  ];
  for (const [name, members] of uses) {
    for (const [senders, listener, why] of pairs) {
      const sender = senders.find((s) => members.has(s));
      if (sender && !members.has(listener)) {
        const at = firstUse.get(`${name}:${sender}`)!;
        out.push({
          rule: "roblox/remote-unhandled",
          severity: "warning",
          category: "remote",
          message: `Remote "${name}" is fired with ${sender} but ${why}`,
          file: at.file,
          line: at.line,
          instancePath: at.id,
        });
      }
    }
  }
  walk(root, (n) => {
    if (getClass(n.className)?.category !== "remote" || n.className.startsWith("Bindable")) return;
    if (!uses.has(n.name)) {
      out.push({
        rule: "roblox/remote-unused",
        severity: "info",
        category: "remote",
        message: `${n.className} ${dottedPath(n.id)} is defined but no script uses it`,
        file: n.origin?.file,
        instancePath: n.id,
      });
    }
  });
  return out;
}
