"use client";

import { ImageIcon } from "lucide-react";
import { Fragment, type CSSProperties, type ReactNode } from "react";
import { isA } from "@/core/roblox/classes";
import { FONT_CSS, FONT_WEIGHTS, familyNameFromUrl } from "@/core/roblox/enums";
import { estimateTextWidth, type LayoutBox } from "@/core/roblox/gui";
import type { RNode } from "@/core/roblox/instance";
import type { RValue } from "@/core/roblox/values";

// Engine defaults for properties a model file does not set.
const DEFAULT_BG: [number, number, number] = [163 / 255, 162 / 255, 165 / 255];
const DEFAULT_TEXT: [number, number, number] = [27 / 255, 42 / 255, 53 / 255];
const DEFAULT_BORDER: [number, number, number] = [27 / 255, 42 / 255, 53 / 255];

const num = (v: RValue | undefined, d: number) => (v && (v.t === "float" || v.t === "int") ? v.v : d);
const col = (v: RValue | undefined, d: [number, number, number]) => (v?.t === "Color3" ? v.v : d);
const rgba = (c: [number, number, number], a: number) => `rgba(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)}, ${Math.max(0, Math.min(1, a))})`;
const enumv = (v: RValue | undefined, d: string) => (v?.t === "Enum" ? v.v : d);

function child(n: RNode, cls: string) {
  return n.children.find((c) => c.className === cls);
}

/** Roblox RichText subset (b, i, u, s, font color/size) rendered as safe React elements. */
function richText(text: string): ReactNode {
  const out: ReactNode[] = [];
  const stack: CSSProperties[] = [{}];
  const re = /<(\/?)(b|i|u|s|font)([^>]*)>|([^<]+)|(<)/g;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m[4] || m[5]) {
      out.push(
        <span key={k++} style={Object.assign({}, ...stack)}>
          {(m[4] ?? m[5]).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")}
        </span>,
      );
      continue;
    }
    if (m[1]) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const tag = m[2];
    const style: CSSProperties = {};
    if (tag === "b") style.fontWeight = 700;
    if (tag === "i") style.fontStyle = "italic";
    if (tag === "u") style.textDecoration = "underline";
    if (tag === "s") style.textDecoration = "line-through";
    if (tag === "font") {
      const color = /color="([^"]+)"/.exec(m[3])?.[1];
      const size = /size="(\d+)"/.exec(m[3])?.[1];
      if (color && /^#?[0-9a-fA-F]{3,8}$|^rgb\(/.test(color)) style.color = color;
      if (size) style.fontSize = `${Number(size)}px`;
    }
    stack.push(style);
  }
  return out;
}

function TextContent({ n, box }: { n: RNode; box: LayoutBox }) {
  const text = n.properties.Text?.t === "string" ? n.properties.Text.v : n.className === "TextBox" ? "" : "Label";
  const placeholder = n.className === "TextBox" && !text && n.properties.PlaceholderText?.t === "string" ? n.properties.PlaceholderText.v : "";
  const font = n.properties.FontFace?.t === "Font" ? n.properties.FontFace : undefined;
  const family = FONT_CSS[familyNameFromUrl(font?.family ?? "")] ?? FONT_CSS.BuilderSans;
  const weight = FONT_WEIGHTS[font?.weight ?? "Regular"] ?? 400;
  let size = num(n.properties.TextSize, 14);
  const scaled = n.properties.TextScaled?.t === "bool" && n.properties.TextScaled.v;
  const wrapped = scaled || (n.properties.TextWrapped?.t === "bool" && n.properties.TextWrapped.v);
  const constraint = child(n, "UITextSizeConstraint");
  const shown = (text || placeholder).replace(/<[^>]+>/g, "");
  if (scaled) {
    const perLine = estimateTextWidth(shown || "M", 1, weight >= 600) || 1;
    size = Math.min(box.h / box.scale * 0.9, (box.w / box.scale) / perLine * 0.95);
    if (constraint) size = Math.max(num(constraint.properties.MinTextSize, 1), Math.min(num(constraint.properties.MaxTextSize, 100), size));
  }
  const xa = enumv(n.properties.TextXAlignment, "Center");
  const ya = enumv(n.properties.TextYAlignment, "Center");
  const stroke = n.children.find((c) => c.className === "UIStroke" && enumv(c.properties.ApplyStrokeMode, "Contextual") === "Contextual");
  const strokeT = n.properties.TextStrokeTransparency?.t === "float" ? n.properties.TextStrokeTransparency.v : 1;
  const style: CSSProperties = {
    fontFamily: family,
    fontWeight: weight,
    fontStyle: font?.style === "Italic" ? "italic" : undefined,
    fontSize: size * box.scale,
    lineHeight: num(n.properties.LineHeight, 1) * 1.15,
    color: placeholder ? rgba(col(n.properties.PlaceholderColor3, [0.7, 0.7, 0.7]), 1) : rgba(col(n.properties.TextColor3, DEFAULT_TEXT), 1 - num(n.properties.TextTransparency, 0)),
    whiteSpace: wrapped ? "normal" : "pre",
    textAlign: xa === "Left" ? "left" : xa === "Right" ? "right" : "center",
    justifyContent: xa === "Left" ? "flex-start" : xa === "Right" ? "flex-end" : "center",
    alignItems: ya === "Top" ? "flex-start" : ya === "Bottom" ? "flex-end" : "center",
    overflow: "hidden",
    textOverflow: enumv(n.properties.TextTruncate, "None") === "AtEnd" ? "ellipsis" : undefined,
    WebkitTextStroke: stroke ? `${num(stroke.properties.Thickness, 1) * box.scale}px ${rgba(col(stroke.properties.Color, [0, 0, 0]), 1 - num(stroke.properties.Transparency, 0))}` : undefined,
    textShadow: strokeT < 1 ? `0 0 ${1 * box.scale}px ${rgba(col(n.properties.TextStrokeColor3, [0, 0, 0]), 1 - strokeT)}` : undefined,
    paintOrder: "stroke fill",
  };
  const rich = n.properties.RichText?.t === "bool" && n.properties.RichText.v;
  return (
    <div className="absolute inset-0 flex" style={style}>
      <span style={{ maxWidth: "100%" }}>{rich ? richText(text) : text || placeholder}</span>
    </div>
  );
}

function boxStyle(b: LayoutBox, parent: LayoutBox | undefined): CSSProperties {
  const n = b.node;
  const style: CSSProperties = {
    position: "absolute",
    left: b.x - (parent?.x ?? 0),
    top: b.y - (parent?.y ?? 0),
    width: b.w,
    height: b.h,
    zIndex: Math.round(b.zIndex),
    overflow: b.clip ? (n.className === "ScrollingFrame" ? "auto" : "hidden") : "visible",
    transform: b.rotation ? `rotate(${b.rotation}deg)` : undefined,
    display: b.visible ? undefined : "none",
  };
  if (!isA(n.className, "GuiObject")) return style;
  const bgT = num(n.properties.BackgroundTransparency, 0);
  const bg = col(n.properties.BackgroundColor3, DEFAULT_BG);
  const gradient = child(n, "UIGradient");
  if (gradient?.properties.Color?.t === "ColorSequence" && bgT < 1) {
    const stops = gradient.properties.Color.v.map(([t, r, g, bl]) => `${rgba([r * bg[0], g * bg[1], bl * bg[2]], 1 - bgT)} ${t * 100}%`);
    style.backgroundImage = `linear-gradient(${90 + num(gradient.properties.Rotation, 0)}deg, ${stops.join(", ")})`;
  } else if (bgT < 1) {
    style.background = rgba(bg, 1 - bgT);
  }
  const corner = child(n, "UICorner");
  if (corner) {
    const r = corner.properties.CornerRadius?.t === "UDim" ? corner.properties.CornerRadius.v : [0, 8];
    style.borderRadius = r[0] * Math.min(b.w, b.h) + r[1] * b.scale;
  }
  const shadows: string[] = [];
  const border = num(n.properties.BorderSizePixel, 1);
  if (border > 0 && bgT < 1) shadows.push(`inset 0 0 0 ${border * b.scale}px ${rgba(col(n.properties.BorderColor3, DEFAULT_BORDER), 1 - bgT)}`);
  const stroke = n.children.find((c) => c.className === "UIStroke" && (enumv(c.properties.ApplyStrokeMode, "Contextual") === "Border" || !isA(n.className, "TextLabel")));
  if (stroke && !(stroke.properties.Enabled?.t === "bool" && !stroke.properties.Enabled.v)) {
    shadows.push(`0 0 0 ${num(stroke.properties.Thickness, 1) * b.scale}px ${rgba(col(stroke.properties.Color, [0, 0, 0]), 1 - num(stroke.properties.Transparency, 0))}`);
  }
  if (shadows.length) style.boxShadow = shadows.join(", ");
  if (n.className === "CanvasGroup") style.opacity = 1 - num(n.properties.GroupTransparency, 0);
  return style;
}

function ImageContent({ n }: { n: RNode }) {
  const img = n.properties.Image?.t === "Content" ? n.properties.Image.v : "";
  const tint = col(n.properties.ImageColor3, [1, 1, 1]);
  const t = num(n.properties.ImageTransparency, 0);
  if (t >= 1) return null;
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 overflow-hidden text-center"
      style={{ background: `repeating-linear-gradient(45deg, ${rgba(tint, 0.14 * (1 - t))} 0 6px, ${rgba(tint, 0.06 * (1 - t))} 6px 12px)`, color: rgba(tint, 0.8 * (1 - t)), borderRadius: "inherit" }}
      title={img ? `${img} — Roblox images load in Studio/game; the builder cannot fetch them` : "No image set"}
    >
      <ImageIcon style={{ width: "min(40%, 28px)", height: "min(40%, 28px)" }} />
      <span style={{ fontSize: 9, maxWidth: "95%" }} className="truncate font-mono opacity-80">
        {img ? img.replace("rbxassetid://", "#") : "no image"}
      </span>
    </div>
  );
}

export function GuiBoxes({ box, parent, selectedId, onSelect, showHidden }: { box: LayoutBox; parent?: LayoutBox; selectedId?: string; onSelect?: (id: string) => void; showHidden?: boolean }) {
  const n = box.node;
  const isGui = isA(n.className, "GuiObject");
  const style = boxStyle(box, parent);
  if (!box.visible && showHidden) {
    style.display = undefined;
    style.opacity = 0.25;
    style.outline = "1px dashed rgba(255,255,255,0.4)";
  }
  if (!isGui && parent) return <Fragment />;
  return (
    <div
      style={style}
      data-gui={n.id}
      onPointerDown={
        onSelect && isGui
          ? (e) => {
              e.stopPropagation();
              onSelect(n.id);
            }
          : undefined
      }
    >
      {(n.className === "ImageLabel" || n.className === "ImageButton") && <ImageContent n={n} />}
      {(n.className === "TextLabel" || n.className === "TextButton" || n.className === "TextBox") && <TextContent n={n} box={box} />}
      {n.className === "ViewportFrame" && <div className="absolute inset-0 grid place-items-center text-[10px] text-white/50">ViewportFrame</div>}
      {box.children.map((c) => (
        <GuiBoxes key={c.node.id} box={c} parent={box} selectedId={selectedId} onSelect={onSelect} showHidden={showHidden} />
      ))}
    </div>
  );
}
