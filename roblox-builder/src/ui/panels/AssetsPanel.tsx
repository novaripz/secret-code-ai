"use client";

import { Box, Download, FileJson, Image as ImageIcon, RefreshCw, Sparkles, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { Diagnostic } from "@/core/diagnostics";
import { api } from "../api";
import { cx, formatBytes, SeverityGlyph, Spinner, StatusIcon, toast } from "../common/ui";
import { useLayout } from "../workspace/layout";
import { useWorkspace } from "../workspace/store";

interface PipelineResult {
  ok: boolean;
  steps: { step: string; ok: boolean; detail: string }[];
  diagnostics: Diagnostic[];
}

function Row({ path, size, href, children }: { path: string; size: number; href: string; children?: React.ReactNode }) {
  return (
    <div className="group flex items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-raise">
      <span className="min-w-0 flex-1 truncate text-fg-2" title={path}>
        {path.split("/").pop()}
      </span>
      <span className="text-[10px] text-fg-3 group-hover:hidden">{formatBytes(size)}</span>
      <span className="hidden items-center gap-1 group-hover:flex">
        {children}
        <a className="text-fg-3 hover:text-fg" href={href} title="Download">
          <Download className="size-3.5" />
        </a>
      </span>
    </div>
  );
}

function Section({ title, icon, count, children }: { title: string; icon: React.ReactNode; count: number; children: React.ReactNode }) {
  if (!count) return null;
  return (
    <div className="mb-3">
      <div className="mb-0.5 flex items-center gap-1.5 px-2 panel-title">
        {icon} {title} <span className="font-normal normal-case tracking-normal">{count}</span>
      </div>
      {children}
    </div>
  );
}

export default function AssetsPanel() {
  const { files, projectId, branch, refreshFiles, openFile, selectInstance, build, startRun, status, validate } = useWorkspace();
  const [busy, setBusy] = useState<string>();
  const [result, setResult] = useState<{ name: string; r: PipelineResult }>();
  const [idea, setIdea] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const groups = useMemo(() => {
    const all = [...files.entries()];
    return {
      models: all.filter(([p]) => p.startsWith("src/assets/") && /\.(model\.json|rbxmx|rbxm)$/.test(p)),
      exports: all.filter(([p]) => p.startsWith("assets/source/") && /\.(glb|gltf|obj)$/.test(p)),
      imported: all.filter(([p]) => p.startsWith("assets/imported/")),
      textures: all.filter(([p]) => /\.(png|jpe?g|tga|bmp)$/.test(p)),
      specs: all.filter(([p]) => p.startsWith("assets/specs/") && p.endsWith(".spec.json")),
    };
  }, [files]);

  const regenerate = async (path: string) => {
    const text = files.get(path)?.text;
    if (!text) return;
    setBusy(path);
    try {
      const spec = JSON.parse(text);
      const r = await api.createAsset(projectId, branch, spec);
      setResult({ name: spec.name ?? path, r });
      if (r.ok) toast.ok(`Rebuilt ${spec.name}: ${r.stats?.parts} parts, ${r.stats?.triangles} triangles`);
      await refreshFiles();
      validate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(undefined);
    }
  };

  const importFiles = async (list: File[]) => {
    if (!list.length) return;
    setBusy("import");
    try {
      const r = await api.importAssets(projectId, branch, list);
      for (const x of r.results) {
        if (x.error) toast.error(`${x.name}: ${x.error}`);
        const errs = (x.diagnostics ?? []).filter((d) => d.severity === "error");
        if (errs.length) toast.error(`${x.name}: ${errs.map((d) => d.message).join("; ")}`);
      }
      setResult({ name: "Import", r: { ok: true, steps: r.results.map((x) => ({ step: x.name, ok: !x.error, detail: x.path ?? x.error ?? "" })), diagnostics: r.results.flatMap((x) => x.diagnostics ?? []) } });
      await refreshFiles();
    } finally {
      setBusy(undefined);
    }
  };

  const view3d = (path: string) => {
    sessionStorage.setItem("rb-viewport-file", path);
    window.dispatchEvent(new Event("rb-viewport-file"));
    useLayout.getState().open("viewport");
  };

  const showModel = (path: string) => {
    const id = build?.nodesByFile.get(path)?.[0];
    if (id) {
      selectInstance(id);
      useLayout.getState().open("viewport");
    }
  };

  return (
    <div
      className="flex h-full flex-col"
      onDragOver={(e) => e.dataTransfer.types.includes("Files") && e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        importFiles([...e.dataTransfer.files]);
      }}
    >
      <div className="border-b border-line p-2">
        <div className="flex gap-1.5">
          <input
            className="input h-7 text-xs"
            placeholder="Describe a 3D asset…"
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && idea.trim()) {
                startRun(`Create a 3D asset for Roblox with create_asset: ${idea.trim()}. Validate it, then make it available in ReplicatedStorage.Assets.`, "chat");
                setIdea("");
              }
            }}
            disabled={!status?.ai.configured}
          />
          <button
            className="btn btn-primary h-7 px-2"
            disabled={!idea.trim() || !status?.ai.configured}
            onClick={() => {
              startRun(`Create a 3D asset for Roblox with create_asset: ${idea.trim()}. Validate it, then make it available in ReplicatedStorage.Assets.`, "chat");
              setIdea("");
            }}
            title="Generate with the agent"
          >
            <Sparkles className="size-3.5" />
          </button>
          <button className="btn h-7 px-2" onClick={() => input.current?.click()} title="Import GLB, glTF, OBJ, FBX, textures, audio, rbxm">
            {busy === "import" ? <Spinner /> : <Upload className="size-3.5" />}
          </button>
          <input ref={input} type="file" multiple hidden accept=".glb,.gltf,.obj,.mtl,.fbx,.png,.jpg,.jpeg,.tga,.bmp,.rbxm,.rbxmx,.ogg,.mp3,.wav" onChange={(e) => importFiles([...(e.target.files ?? [])])} />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        <Section title="Roblox models" icon={<Box className="size-3" />} count={groups.models.length}>
          {groups.models.map(([p, f]) => (
            <Row key={p} path={p} size={f.size} href={api.rawFileUrl(projectId, branch, p)}>
              <button className="text-fg-3 hover:text-fg" onClick={() => showModel(p)} title="Show in 3D">
                <Box className="size-3.5" />
              </button>
            </Row>
          ))}
        </Section>
        <Section title="Specs (source of truth)" icon={<FileJson className="size-3" />} count={groups.specs.length}>
          {groups.specs.map(([p, f]) => (
            <Row key={p} path={p} size={f.size} href={api.rawFileUrl(projectId, branch, p)}>
              <button className="text-fg-3 hover:text-fg" onClick={() => { openFile(p); useLayout.getState().open("editor"); }} title="Edit spec">
                <FileJson className="size-3.5" />
              </button>
              <button className="text-fg-3 hover:text-fg" onClick={() => regenerate(p)} title="Rebuild model and exports from this spec">
                {busy === p ? <Spinner /> : <RefreshCw className="size-3.5" />}
              </button>
            </Row>
          ))}
        </Section>
        <Section title="3D source exports" icon={<Box className="size-3" />} count={groups.exports.length}>
          {groups.exports.map(([p, f]) => (
            <Row key={p} path={p} size={f.size} href={api.rawFileUrl(projectId, branch, p)}>
              {p.endsWith(".glb") && (
                <button className="text-fg-3 hover:text-fg" onClick={() => view3d(p)} title="View in 3D">
                  <Box className="size-3.5" />
                </button>
              )}
            </Row>
          ))}
        </Section>
        <Section title="Imported" icon={<Upload className="size-3" />} count={groups.imported.length}>
          {groups.imported.map(([p, f]) => (
            <Row key={p} path={p} size={f.size} href={api.rawFileUrl(projectId, branch, p)}>
              {p.endsWith(".glb") && (
                <button className="text-fg-3 hover:text-fg" onClick={() => view3d(p)} title="View in 3D">
                  <Box className="size-3.5" />
                </button>
              )}
            </Row>
          ))}
        </Section>
        <Section title="Textures" icon={<ImageIcon className="size-3" />} count={groups.textures.length}>
          {groups.textures.map(([p, f]) => (
            <Row key={p} path={p} size={f.size} href={api.rawFileUrl(projectId, branch, p)}>
              <button className="text-fg-3 hover:text-fg" onClick={() => { openFile(p); useLayout.getState().open("editor"); }} title="Preview">
                <ImageIcon className="size-3.5" />
              </button>
            </Row>
          ))}
        </Section>
        {!Object.values(groups).some((g) => g.length) && (
          <div className="p-4 text-center text-xs leading-relaxed text-fg-3">
            No assets yet. Describe one above, or drop GLB, OBJ, FBX, images or audio here.
          </div>
        )}
        {result && (
          <div className="mt-2 rounded-xl bg-bg-2 p-2.5 hairline">
            <div className="mb-1.5 text-xs font-medium">{result.name}</div>
            {result.r.steps.map((s, i) => (
              <div key={i} className="flex items-start gap-1.5 text-[11px]">
                <StatusIcon status={s.ok ? "pass" : "fail"} className="mt-0.5 size-3" />
                <span className="font-medium text-fg-2">{s.step}</span>
                <span className="min-w-0 truncate text-fg-3">{s.detail}</span>
              </div>
            ))}
            {result.r.diagnostics.map((d, i) => (
              <div key={i} className={cx("mt-1 flex gap-1.5 text-[11px]", d.severity === "error" ? "text-err" : "text-fg-2")}>
                <SeverityGlyph severity={d.severity} /> {d.message}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
