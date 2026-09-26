"use client";

import { AlertTriangle, CloudUpload, Copy, Download, FileArchive, Box, MonitorPlay, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { dottedPath, walk, type RNode } from "@/core/roblox/instance";
import { isRobloxKind } from "@/core/roblox/template";
import { api } from "../api";
import { cx, formatBytes, Spinner, StatusIcon, toast, useDialog } from "../common/ui";
import { useWorkspace } from "../workspace/store";

function Card({ icon, title, children, tint }: { icon: React.ReactNode; title: string; children: React.ReactNode; tint?: string }) {
  return (
    <div className="rounded-2xl bg-panel-2 p-4 hairline">
      <div className="mb-3 flex items-center gap-2.5">
        <span className={cx("grid size-8 place-items-center rounded-xl", tint ?? "bg-accent/15 text-accent")}>{icon}</span>
        <span className="text-sm font-semibold">{title}</span>
      </div>
      {children}
    </div>
  );
}

export default function ExportPanel() {
  const { projectId, branch, meta, build, selectedInstance, status, files, refreshMeta } = useWorkspace();
  const dialog = useDialog();
  const [check, setCheck] = useState<{ instances: number; bytes: number; warnings: string[]; buildErrors: string[] }>();
  const [modelChoice, setModel] = useState<string>("");
  const [publishing, setPublishing] = useState<string>();
  const [result, setResult] = useState<{ ok: boolean; text: string }>();
  const [assetPath, setAssetPath] = useState("");
  const [assetType, setAssetType] = useState<"Model" | "Decal" | "Audio">("Model");
  const [uploadResult, setUploadResult] = useState<{ ok: boolean; text: string; assetId?: string }>();
  const roblox = meta && isRobloxKind(meta.kind);

  useEffect(() => {
    if (!roblox || !build) return;
    const isPlace = build.root.className === "DataModel";
    if (isPlace) api.exportCheck(projectId, branch, "rbxlx").then(setCheck).catch(() => setCheck(undefined));
  }, [projectId, branch, roblox, build]);

  const models = useMemo(() => {
    const out: RNode[] = [];
    if (!build) return out;
    walk(build.root, (n, _p, depth) => {
      if (depth >= 2 && depth <= 4 && ["Model", "ScreenGui", "Folder", "Tool", "Script", "ModuleScript"].includes(n.className) && !/Server$|Client$|Shared$/.test(n.name)) out.push(n);
    });
    return out;
  }, [build]);
  const model = modelChoice || (selectedInstance && models.some((m) => m.id === selectedInstance) ? selectedInstance : (models[0]?.id ?? ""));

  const uploadable = useMemo(() => [...files.keys()].filter((p) => /\.(glb|fbx|png|jpe?g|mp3|ogg|rbxm|rbxmx)$/i.test(p)), [files]);

  const publish = async (versionType: "Saved" | "Published", force = false) => {
    if (!meta) return;
    if (!force) {
      const ok = await dialog.confirm(
        versionType === "Published" ? "Publish this place live?" : "Save this place to Roblox?",
        <>
          Uploads <b>{branch}</b> as a new {versionType === "Published" ? <b>published</b> : "saved"} version of place {meta.settings.robloxPlaceId}.{" "}
          {versionType === "Published" ? "Players joining new servers get this version." : "It will not be live until you publish."}
        </>,
        { confirmLabel: versionType === "Published" ? "Publish live" : "Save to Roblox" },
      );
      if (!ok) return;
    }
    setPublishing(versionType);
    setResult(undefined);
    try {
      const r = await api.publish(projectId, branch, { type: "place", versionType, force });
      setResult(r.ok ? { ok: true, text: `Roblox accepted version ${r.data?.versionNumber} (${versionType.toLowerCase()}).` } : { ok: false, text: r.error ?? "Roblox did not confirm the publish" });
    } catch (e) {
      const err = e as { status?: number; message: string };
      if (err.status === 409) {
        setPublishing(undefined);
        if (await dialog.confirm("The compatibility check has errors", `${err.message} Publishing a broken place can break live servers.`, { confirmLabel: "Publish anyway", danger: true })) return publish(versionType, true);
        return;
      }
      setResult({ ok: false, text: err.message });
    } finally {
      setPublishing(undefined);
    }
  };

  const upload = async () => {
    if (!assetPath) return;
    const name = await dialog.prompt("Asset name on Roblox", { initial: assetPath.split("/").pop()!.replace(/\.[^.]+$/, ""), confirmLabel: "Upload" });
    if (!name) return;
    setUploadResult(undefined);
    setPublishing("asset");
    try {
      const r = await api.publish(projectId, branch, { type: "asset", path: assetPath, assetType, displayName: name });
      setUploadResult(r.ok ? { ok: true, text: `Uploaded as asset ${r.data?.assetId}.`, assetId: r.data?.assetId } : { ok: false, text: r.error ?? "Upload not confirmed" });
    } catch (e) {
      setUploadResult({ ok: false, text: (e as Error).message });
    } finally {
      setPublishing(undefined);
    }
  };

  const setSetting = async (key: "robloxUniverseId" | "robloxPlaceId" | "robloxCreatorUserId" | "robloxCreatorGroupId", value: string) => {
    await api.updateProject(projectId, { settings: { [key]: value.trim() } }).catch((e) => toast.error(e.message));
    await refreshMeta();
  };

  if (!meta) return null;
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto grid max-w-5xl gap-4 p-5 lg:grid-cols-2">
        {roblox && build?.root.className === "DataModel" && (
          <Card icon={<MonitorPlay className="size-4" />} title="Place for Roblox Studio (.rbxlx)">
            <p className="text-xs leading-relaxed text-fg-2">Everything in this project as one place file. In Studio: File → Open from File. Built by the same mapping Rojo uses.</p>
            {check ? (
              <div className="mt-3 space-y-1 text-xs">
                <div className="text-fg-3">
                  {check.instances} instances · {formatBytes(check.bytes)}
                </div>
                {check.buildErrors.map((e, i) => (
                  <div key={i} className="flex gap-1.5 text-err">
                    <AlertTriangle className="mt-0.5 size-3 shrink-0" /> {e}
                  </div>
                ))}
                {check.warnings.map((w, i) => (
                  <div key={i} className="flex gap-1.5 text-warn">
                    <AlertTriangle className="mt-0.5 size-3 shrink-0" /> {w}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3"><Spinner className="text-fg-3" /></div>
            )}
            <a className="btn btn-primary mt-3" href={api.exportUrl(projectId, branch, "rbxlx")}>
              <Download className="size-3.5" /> Download {meta.name}.rbxlx
            </a>
          </Card>
        )}

        {roblox && (
          <Card icon={<Box className="size-4" />} title="Model (.rbxmx)" tint="bg-cyan-500/15 text-cyan-400">
            <p className="text-xs leading-relaxed text-fg-2">One instance and its descendants, for Insert from File or the Toolbox: an asset, a ScreenGui, a tool or a system.</p>
            {build?.root.className === "DataModel" ? (
              <select className="input mt-3" value={model} onChange={(e) => setModel(e.target.value)}>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {dottedPath(m.id)} ({m.className})
                  </option>
                ))}
              </select>
            ) : (
              <div className="mt-3 text-xs text-fg-3">The whole project is one model.</div>
            )}
            <a
              className={cx("btn mt-3", !model && build?.root.className === "DataModel" && "pointer-events-none opacity-40")}
              href={api.exportUrl(projectId, branch, "rbxmx", build?.root.className === "DataModel" ? dottedPath(model) : undefined)}
            >
              <Download className="size-3.5" /> Download .rbxmx
            </a>
          </Card>
        )}

        <Card icon={<FileArchive className="size-4" />} title={roblox ? "Rojo project (.zip)" : "Project (.zip)"} tint="bg-emerald-500/15 text-emerald-400">
          <p className="text-xs leading-relaxed text-fg-2">{roblox ? "The source project. Keep developing with live sync:" : "All project files."}</p>
          {roblox && (
            <pre className="mt-2 rounded-lg bg-bg-2 p-2.5 font-mono text-[11px] leading-relaxed text-fg-2 hairline">
              rokit install{"\n"}rojo plugin install{"\n"}rojo serve
            </pre>
          )}
          <a className="btn mt-3" href={api.exportUrl(projectId, branch, "zip")}>
            <Download className="size-3.5" /> Download .zip
          </a>
        </Card>

        {roblox && (
          <Card icon={<CloudUpload className="size-4" />} title="Publish with Open Cloud" tint="bg-violet-500/15 text-violet-400">
            {!status?.robloxCloud && (
              <div className="mb-3 rounded-lg bg-warn/10 p-2.5 text-xs leading-relaxed text-warn">
                Set <code className="font-mono">ROBLOX_OPEN_CLOUD_API_KEY</code> on the server (scopes: universe-places:write, asset:write) to publish from here. The key never reaches the browser.
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] text-fg-3">
                Universe id
                <input className="input mt-1" defaultValue={meta.settings.robloxUniverseId ?? ""} onBlur={(e) => setSetting("robloxUniverseId", e.target.value)} placeholder="1234567890" />
              </label>
              <label className="text-[11px] text-fg-3">
                Place id
                <input className="input mt-1" defaultValue={meta.settings.robloxPlaceId ?? ""} onBlur={(e) => setSetting("robloxPlaceId", e.target.value)} placeholder="9876543210" />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn" disabled={!status?.robloxCloud || !!publishing || !meta.settings.robloxPlaceId} onClick={() => publish("Saved")}>
                {publishing === "Saved" ? <Spinner /> : <Upload className="size-3.5" />} Save version
              </button>
              <button className="btn btn-primary" disabled={!status?.robloxCloud || !!publishing || !meta.settings.robloxPlaceId} onClick={() => publish("Published")}>
                {publishing === "Published" ? <Spinner /> : <CloudUpload className="size-3.5" />} Publish live
              </button>
            </div>
            {result && (
              <div className={cx("mt-3 flex items-start gap-2 rounded-lg p-2.5 text-xs", result.ok ? "bg-ok/10 text-ok" : "bg-err/10 text-err")}>
                <StatusIcon status={result.ok ? "pass" : "fail"} className="size-3.5 shrink-0" /> {result.text}
              </div>
            )}

            <div className="mt-5 border-t border-line pt-4">
              <div className="mb-2 text-xs font-medium">Upload an asset</div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[11px] text-fg-3">
                  Creator user id
                  <input className="input mt-1" defaultValue={meta.settings.robloxCreatorUserId ?? ""} onBlur={(e) => setSetting("robloxCreatorUserId", e.target.value)} />
                </label>
                <label className="text-[11px] text-fg-3">
                  or group id
                  <input className="input mt-1" defaultValue={meta.settings.robloxCreatorGroupId ?? ""} onBlur={(e) => setSetting("robloxCreatorGroupId", e.target.value)} />
                </label>
              </div>
              <div className="mt-2 flex gap-2">
                <select className="input" value={assetPath} onChange={(e) => setAssetPath(e.target.value)}>
                  <option value="">Choose a file…</option>
                  {uploadable.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
                <select className="input w-28" value={assetType} onChange={(e) => setAssetType(e.target.value as "Model")}>
                  <option>Model</option>
                  <option>Decal</option>
                  <option>Audio</option>
                </select>
              </div>
              <button className="btn mt-2" disabled={!status?.robloxCloud || !assetPath || !!publishing} onClick={upload}>
                {publishing === "asset" ? <Spinner /> : <Upload className="size-3.5" />} Upload
              </button>
              {uploadResult && (
                <div className={cx("mt-2 flex items-center gap-2 rounded-lg p-2.5 text-xs", uploadResult.ok ? "bg-ok/10 text-ok" : "bg-err/10 text-err")}>
                  <StatusIcon status={uploadResult.ok ? "pass" : "fail"} className="size-3.5 shrink-0" /> {uploadResult.text}
                  {uploadResult.assetId && (
                    <button className="ml-auto" onClick={() => { navigator.clipboard.writeText(`rbxassetid://${uploadResult.assetId}`); toast.ok("Copied"); }} title="Copy rbxassetid">
                      <Copy className="size-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
