// UI audit: lays every ScreenGui out at the screen sizes Roblox players
// actually use and reports what breaks: elements pushed off screen on a
// phone, touch targets too small to tap, text too small to read, and
// designs that have drifted (too many fonts, corner radii or colours).

import type { Diagnostic } from "../diagnostics";
import { isA } from "./classes";
import { flattenBoxes, layoutGui, type LayoutBox } from "./gui";
import { dottedPath, walk, type RNode } from "./instance";

export const AUDIT_VIEWPORTS = [
  { name: "phone (landscape)", w: 844, h: 390 },
  { name: "tablet", w: 1024, h: 768 },
  { name: "desktop", w: 1920, h: 1080 },
] as const;

function isInteractive(n: RNode): boolean {
  return n.className === "TextButton" || n.className === "ImageButton" || n.className === "TextBox";
}

function visibleChain(b: LayoutBox, parents: LayoutBox[]): boolean {
  return b.visible && parents.every((p) => p.visible);
}

export function auditScreenGui(gui: RNode): Diagnostic[] {
  const out: Diagnostic[] = [];
  const seen = new Set<string>();
  const add = (rule: string, severity: Diagnostic["severity"], node: RNode, message: string) => {
    const key = `${rule}|${node.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ rule, severity, category: "ui", message, file: node.origin?.file, instancePath: node.id });
  };

  for (const vp of AUDIT_VIEWPORTS) {
    const root = layoutGui(gui, vp);
    const go = (b: LayoutBox, parents: LayoutBox[]) => {
      const n = b.node;
      if (isA(n.className, "GuiObject") && visibleChain(b, parents)) {
        const path = dottedPath(n.id);
        const clippedByParent = parents.some((p) => p.clip);
        if (!clippedByParent && b.w > 0 && b.h > 0) {
          const outside = b.x + b.w < 0 || b.y + b.h < 0 || b.x > vp.w || b.y > vp.h;
          const partly = !outside && (b.x < -1 || b.y < -1 || b.x + b.w > vp.w + 1 || b.y + b.h > vp.h + 1);
          if (outside) add("ui/offscreen", "warning", n, `${path} is entirely off screen on ${vp.name} (${vp.w}×${vp.h})`);
          else if (partly) add("ui/clipped-by-screen", "warning", n, `${path} runs off the edge of the screen on ${vp.name} (${vp.w}×${vp.h}); use scale sizes or a UISizeConstraint`);
        }
        if (vp.name.startsWith("phone") && isInteractive(n) && (b.h < 32 || b.w < 32)) {
          add("ui/touch-target", "warning", n, `${path} is ${Math.round(b.w)}×${Math.round(b.h)} px on a phone; touch targets should be at least ~40 px`);
        }
        const text = n.properties.Text;
        if (text?.t === "string" && text.v.trim() && !(n.properties.TextScaled?.t === "bool" && n.properties.TextScaled.v)) {
          const size = n.properties.TextSize?.t === "float" || n.properties.TextSize?.t === "int" ? n.properties.TextSize.v : 14;
          if (size * b.scale < 10) add("ui/text-small", "warning", n, `${path} uses ${size}px text, which is hard to read on phones`);
        }
        // Overlapping interactive siblings under free positioning.
        if (isInteractive(n) && !b.laidOut && parents.length) {
          const siblings = parents[parents.length - 1].children.filter((s) => s !== b && isInteractive(s.node) && s.visible);
          for (const s of siblings) {
            const overlap = Math.max(0, Math.min(b.x + b.w, s.x + s.w) - Math.max(b.x, s.x)) * Math.max(0, Math.min(b.y + b.h, s.y + s.h) - Math.max(b.y, s.y));
            if (overlap > 0.25 * Math.min(b.w * b.h, s.w * s.h)) {
              add("ui/overlap", "warning", n, `${path} overlaps button ${s.node.name} on ${vp.name}; one of them cannot be clicked there`);
            }
          }
        }
      }
      for (const c of b.children) go(c, [...parents, b]);
    };
    go(root, []);
  }

  // Design consistency across the whole ScreenGui.
  const fonts = new Set<string>();
  const radii = new Set<string>();
  walk(gui, (n) => {
    const f = n.properties.FontFace;
    if (f?.t === "Font") fonts.add(f.family);
    if (n.className === "UICorner") {
      const r = n.properties.CornerRadius;
      if (r?.t === "UDim") radii.add(`${r.v[0]},${r.v[1]}`);
    }
  });
  if (fonts.size > 3) {
    add("ui/fonts", "info", gui, `${dottedPath(gui.id)} uses ${fonts.size} font families; 1–2 reads as a designed UI`);
  }
  if (radii.size > 4) {
    add("ui/radii", "info", gui, `${dottedPath(gui.id)} uses ${radii.size} different corner radii; a small set keeps the UI consistent`);
  }
  return out;
}

/** Text description of a ScreenGui's layout, for the agent's preview_project tool. */
export function describeLayout(gui: RNode, vp: { w: number; h: number }): string {
  const root = layoutGui(gui, vp);
  const lines: string[] = [`${gui.name} at ${vp.w}×${vp.h}:`];
  for (const b of flattenBoxes(root)) {
    if (b === root || !isA(b.node.className, "GuiObject")) continue;
    const depth = dottedPath(b.node.id).split(".").length - dottedPath(gui.id).split(".").length;
    const text = b.node.properties.Text?.t === "string" ? ` "${b.node.properties.Text.v.slice(0, 30)}"` : "";
    lines.push(`${"  ".repeat(depth)}${b.node.name} (${b.node.className}) x=${Math.round(b.x)} y=${Math.round(b.y)} ${Math.round(b.w)}×${Math.round(b.h)}${b.visible ? "" : " [hidden]"}${text}`);
  }
  return lines.join("\n");
}
