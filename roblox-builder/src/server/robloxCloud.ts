// Roblox Open Cloud: publishing a place and uploading assets, through
// Roblox's official APIs. Results are reported exactly as Roblox returns
// them: a publish only counts as done when Roblox answers with a version
// number, and an upload only when its operation completes with an asset id.
//
// The API key is server configuration (ROBLOX_OPEN_CLOUD_API_KEY); it is
// never stored in a project or sent to the browser. It needs the
// universe-places:write scope for publishing and asset:write for uploads.

export interface CloudResult<T> {
  ok: boolean;
  status?: number;
  data?: T;
  error?: string;
}

export function cloudConfigured(): boolean {
  return !!process.env.ROBLOX_OPEN_CLOUD_API_KEY;
}

function key(): string {
  const k = process.env.ROBLOX_OPEN_CLOUD_API_KEY;
  if (!k) throw new Error("ROBLOX_OPEN_CLOUD_API_KEY is not set on the server");
  return k;
}

async function readError(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const j = JSON.parse(text);
    return j.message || j.error || j.errors?.[0]?.message || text.slice(0, 300);
  } catch {
    return text.slice(0, 300) || res.statusText;
  }
}

export async function publishPlace(universeId: string, placeId: string, rbxlx: string, versionType: "Published" | "Saved"): Promise<CloudResult<{ versionNumber: number }>> {
  if (!/^\d+$/.test(universeId) || !/^\d+$/.test(placeId)) return { ok: false, error: "Universe and place ids must be numbers" };
  let res: Response;
  try {
    res = await fetch(`https://apis.roblox.com/universes/v1/${universeId}/places/${placeId}/versions?versionType=${versionType}`, {
      method: "POST",
      headers: { "x-api-key": key(), "content-type": "application/xml" },
      body: rbxlx,
    });
  } catch (err) {
    return { ok: false, error: `Could not reach Roblox: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!res.ok) return { ok: false, status: res.status, error: await readError(res) };
  const data = (await res.json().catch(() => ({}))) as { versionNumber?: number };
  if (typeof data.versionNumber !== "number") return { ok: false, status: res.status, error: "Roblox did not return a version number; the publish cannot be confirmed" };
  return { ok: true, status: res.status, data: { versionNumber: data.versionNumber } };
}

export type UploadAssetType = "Model" | "Decal" | "Audio";

const CONTENT_TYPES: Record<string, string> = {
  glb: "model/gltf-binary",
  gltf: "model/gltf+json",
  fbx: "model/fbx",
  rbxm: "model/x-rbxm",
  rbxmx: "model/x-rbxm",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  bmp: "image/bmp",
  tga: "image/tga",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
};

export async function uploadAsset(input: {
  assetType: UploadAssetType;
  fileName: string;
  data: Uint8Array;
  displayName: string;
  description: string;
  creator: { userId?: string; groupId?: string };
}): Promise<CloudResult<{ assetId: string; operationPath?: string }>> {
  const ext = input.fileName.split(".").pop()?.toLowerCase() ?? "";
  const contentType = CONTENT_TYPES[ext];
  if (!contentType) return { ok: false, error: `.${ext} files cannot be uploaded as ${input.assetType}` };
  const creator = input.creator.groupId ? { groupId: input.creator.groupId } : input.creator.userId ? { userId: input.creator.userId } : undefined;
  if (!creator) return { ok: false, error: "Set the creator (user id or group id) in project settings" };

  const form = new FormData();
  form.append(
    "request",
    JSON.stringify({
      assetType: input.assetType,
      displayName: input.displayName.slice(0, 50),
      description: input.description.slice(0, 1000),
      creationContext: { creator },
    }),
  );
  form.append("fileContent", new Blob([new Uint8Array(input.data)], { type: contentType }), input.fileName);

  let res: Response;
  try {
    res = await fetch("https://apis.roblox.com/assets/v1/assets", { method: "POST", headers: { "x-api-key": key() }, body: form });
  } catch (err) {
    return { ok: false, error: `Could not reach Roblox: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!res.ok) return { ok: false, status: res.status, error: await readError(res) };
  let op = (await res.json().catch(() => ({}))) as { path?: string; done?: boolean; response?: { assetId?: string } };
  // Uploads are long-running operations; poll until Roblox says it is done.
  for (let i = 0; i < 30 && !op.done && op.path; i++) {
    await new Promise((r) => setTimeout(r, 1000 + i * 250));
    const poll = await fetch(`https://apis.roblox.com/assets/v1/${op.path}`, { headers: { "x-api-key": key() } }).catch(() => undefined);
    if (!poll) continue;
    if (!poll.ok) return { ok: false, status: poll.status, error: await readError(poll) };
    op = await poll.json();
  }
  if (!op.done) return { ok: false, error: "Roblox is still processing the upload; check Creator Hub before using it", data: { assetId: "", operationPath: op.path } };
  const assetId = op.response?.assetId;
  if (!assetId) return { ok: false, error: "Roblox finished the operation but returned no asset id (it may have been rejected by moderation)" };
  return { ok: true, data: { assetId, operationPath: op.path } };
}
