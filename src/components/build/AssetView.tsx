"use client";

import { useMemo, useState } from "react";
import type { FileNode } from "@/types";
import { assetByteSize, familyOf, humanSize } from "@/lib/assets";

// What the editor shows instead of an asset's text.
//
// Monaco handed a data URL renders half a megabyte of base64 on one line. It is
// not editable in any useful sense, it locks the tab while it lays out, and it
// tells the student nothing about the file they just clicked. So an asset gets
// its own view: the thing itself, at a size that fits, with the facts about it
// underneath.
//
// Deliberately not editable. There is no honest in-browser editor for a PNG
// here, and a text box over base64 is a trap: one stray character and the image
// is gone with no error, which is a worse failure than not offering it.

export function AssetView({ node }: { node: FileNode }) {
  const url = node.content ?? "";
  const mimeType = node.mimeType ?? "";
  const family = familyOf(mimeType);
  const bytes = useMemo(() => assetByteSize(url), [url]);
  // Measured on load so a small image can be shown at a useful size. A sprite
  // is the case that matters: a 16x16 character drawn at 16 physical pixels is
  // a speck, and the student cannot tell whether the file is right. Blown up
  // with smoothing it would be a blurry speck instead, which is why this also
  // switches to pixelated — that is what pixel art is supposed to look like.
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const tiny = natural !== null && natural.w > 0 && natural.w <= 128 && natural.h <= 128;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-6">
        {family === "image" ? (
          // Checkerboard behind it, because a PNG with transparency on a dark
          // panel looks like a PNG with a black background, and the student
          // then "fixes" a problem that was never there.
          <div
            className="max-h-full max-w-full rounded-lg p-2"
            style={{
              backgroundImage:
                "linear-gradient(45deg,#8883 25%,transparent 25%,transparent 75%,#8883 75%)," +
                "linear-gradient(45deg,#8883 25%,transparent 25%,transparent 75%,#8883 75%)",
              backgroundSize: "16px 16px",
              backgroundPosition: "0 0, 8px 8px",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={node.name}
              onLoad={(e) =>
                setNatural({
                  w: e.currentTarget.naturalWidth,
                  h: e.currentTarget.naturalHeight,
                })
              }
              className="max-h-[60vh] max-w-full object-contain"
              style={
                tiny
                  ? { width: Math.min(256, natural.w * 8), imageRendering: "pixelated" }
                  : { imageRendering: "auto" }
              }
            />
          </div>
        ) : family === "audio" ? (
          <audio controls src={url} className="w-full max-w-md">
            Your browser cannot play this audio file.
          </audio>
        ) : family === "video" ? (
          <video controls src={url} className="max-h-[60vh] max-w-full rounded-lg" />
        ) : family === "font" ? (
          // A font has nothing to show but itself, so it shows itself: the face
          // is loaded under a generated name and used for one specimen line.
          <div className="text-center">
            <style>{`@font-face{font-family:"panda-specimen-${node.id}";src:url("${url}")}`}</style>
            <p
              className="text-3xl text-[var(--text)]"
              style={{ fontFamily: `"panda-specimen-${node.id}", sans-serif` }}
            >
              The quick brown fox
            </p>
            <p
              className="mt-2 text-lg text-[var(--text-dim)]"
              style={{ fontFamily: `"panda-specimen-${node.id}", sans-serif` }}
            >
              0123456789 &amp; ?!
            </p>
          </div>
        ) : (
          <p className="text-sm text-[var(--text-faint)]">
            This file is stored as data and has no preview.
          </p>
        )}
      </div>

      <div className="shrink-0 border-t border-[var(--line)] px-3 py-2 text-[11px] text-[var(--text-faint)]">
        <span className="font-mono text-[var(--text-dim)]">{node.path}</span>
        {" · "}
        {mimeType || "unknown type"}
        {" · "}
        {humanSize(bytes)}
        {/* The real pixel dimensions, which is the first thing you want to know
            about an image and the one thing the file size cannot tell you. */}
        {natural && natural.w > 0 ? ` · ${natural.w}×${natural.h}` : ""}
        {tiny ? " · shown enlarged" : ""}
        {/* The one thing a student needs in order to USE it, spelled out, because
            guessing the right relative path is where this goes wrong. */}
        <span className="ml-2 block pt-1 sm:ml-0">
          Use it with <code className="font-mono text-[var(--text-dim)]">{refExample(node.path, family)}</code>
        </span>
      </div>
    </div>
  );
}

function refExample(path: string, family: ReturnType<typeof familyOf>): string {
  if (family === "audio") return `new Audio("${path}").play()`;
  if (family === "video") return `<video src="${path}" controls></video>`;
  if (family === "font") return `@font-face { src: url("${path}") }`;
  return `<img src="${path}" alt="">`;
}
