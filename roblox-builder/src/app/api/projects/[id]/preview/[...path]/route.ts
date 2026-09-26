import { route, type Params } from "@/server/http";
import { getProject, readFile, StoreError } from "@/server/store";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  wav: "audio/wav",
  glb: "model/gltf-binary",
  gltf: "model/gltf+json",
  txt: "text/plain; charset=utf-8",
};

/**
 * Reports errors, console output and unhandled rejections to the workspace
 * (window.parent), so the Logs panel shows what the running app is doing.
 */
const BRIDGE = `<script>(function(){var P=window.parent;function s(t,a){try{P.postMessage({__rbPreview:true,type:t,args:a.map(function(x){try{return typeof x==="string"?x:JSON.stringify(x)}catch(e){return String(x)}})},"*")}catch(e){}}
["log","info","warn","error"].forEach(function(k){var o=console[k];console[k]=function(){s(k,[].slice.call(arguments));o.apply(console,arguments)}});
window.addEventListener("error",function(e){s("error",[(e.message||"Error")+(e.filename?" ("+e.filename.split("/").pop()+":"+e.lineno+")":"")])});
window.addEventListener("unhandledrejection",function(e){s("error",["Unhandled promise rejection: "+(e.reason&&e.reason.message||e.reason)])});
s("ready",[location.pathname]);})();</script>`;

/**
 * Serves a web project's files for the live preview iframe. The iframe is
 * sandboxed without allow-same-origin, so it runs with an opaque origin and
 * its module/fetch requests are CORS requests; they are allowed here.
 */
export const GET = route(async (req, { params }: Params<{ id: string; path: string[] }>) => {
  const { id, path } = await params;
  const meta = await getProject(id);
  // `/preview/~branch/...` pins a branch in the path itself, so relative
  // subresource URLs inside the page stay on that branch.
  const segs = path.map(decodeURIComponent);
  const pinned = segs[0]?.startsWith("~") ? segs.shift()!.slice(1) : undefined;
  const branch = pinned || new URL(req.url).searchParams.get("branch") || meta.activeBranch;
  const rel = segs.join("/") || "index.html";
  let f;
  try {
    f = await readFile(id, branch, rel);
  } catch (err) {
    if (err instanceof StoreError && err.status === 404) {
      return new Response(`Not found: ${rel}`, { status: 404, headers: { "access-control-allow-origin": "*", "content-type": "text/plain" } });
    }
    throw err;
  }
  const ext = rel.split(".").pop()?.toLowerCase() ?? "";
  let body: string | Uint8Array = f.data;
  if ((ext === "html" || ext === "htm") && typeof body === "string") {
    body = body.includes("<head>") ? body.replace("<head>", `<head>${BRIDGE}`) : BRIDGE + body;
  }
  return new Response(typeof body === "string" ? body : new Uint8Array(body), {
    headers: {
      "content-type": TYPES[ext] ?? "application/octet-stream",
      "access-control-allow-origin": "*",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
});
