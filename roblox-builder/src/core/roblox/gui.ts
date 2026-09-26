// Roblox GUI layout, computed the way the engine does it.
//
// The live preview and the visual editor both draw from this, so what the
// user drags around is the same geometry the ScreenGui will have in game:
// UDim2 scale+offset against the parent's content box, AnchorPoint,
// SizeConstraint, UIPadding, UIListLayout/UIGridLayout flow, aspect-ratio and
// size constraints, UIScale, AutomaticSize (estimated for text), and clipping.

import { isA } from "./classes";
import type { RNode } from "./instance";
import type { RValue } from "./values";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LayoutBox extends Rect {
  node: RNode;
  rotation: number;
  zIndex: number;
  visible: boolean;
  clip: boolean;
  /** Set by a parent layout (UIListLayout etc.), so dragging should edit LayoutOrder, not Position. */
  laidOut: boolean;
  scale: number;
  children: LayoutBox[];
}

/** Roblox's top bar inset, applied when ScreenGui.IgnoreGuiInset is false. */
export const TOPBAR_INSET = 58;

const num = (v: RValue | undefined, d: number) => (v && (v.t === "float" || v.t === "int") ? v.v : d);
const bool = (v: RValue | undefined, d: boolean) => (v?.t === "bool" ? v.v : d);
const udim2 = (v: RValue | undefined, d: [number, number, number, number]) => (v?.t === "UDim2" ? v.v : d);
const udim = (v: RValue | undefined, d: [number, number]) => (v?.t === "UDim" ? v.v : d);
const vec2 = (v: RValue | undefined, d: [number, number]) => (v?.t === "Vector2" ? v.v : d);
const enumv = (v: RValue | undefined, d: string) => (v?.t === "Enum" ? v.v : d);

export function isGuiObject(n: RNode): boolean {
  return isA(n.className, "GuiObject");
}

function findChild(n: RNode, cls: string): RNode | undefined {
  return n.children.find((c) => c.className === cls);
}

/** Rough text width, good enough for AutomaticSize estimates in the preview. */
export function estimateTextWidth(text: string, size: number, bold = false): number {
  let w = 0;
  for (const ch of text) {
    if (/[\u{1F300}-\u{1FAFF}☀-➿]/u.test(ch)) w += 1.15;
    else if (/[iljtf.,:;'!|]/.test(ch)) w += 0.3;
    else if (/[mwMW@]/.test(ch)) w += 0.85;
    else if (/[A-Z0-9]/.test(ch)) w += 0.62;
    else if (ch === " ") w += 0.28;
    else w += 0.52;
  }
  return w * size * (bold ? 1.06 : 1);
}

/** Content rect after UIPadding. */
function paddedRect(n: RNode, r: Rect): Rect {
  const pad = findChild(n, "UIPadding");
  if (!pad) return r;
  const [ts, to] = udim(pad.properties.PaddingTop, [0, 0]);
  const [bs, bo] = udim(pad.properties.PaddingBottom, [0, 0]);
  const [ls, lo] = udim(pad.properties.PaddingLeft, [0, 0]);
  const [rs, ro] = udim(pad.properties.PaddingRight, [0, 0]);
  const top = ts * r.h + to;
  const bottom = bs * r.h + bo;
  const left = ls * r.w + lo;
  const right = rs * r.w + ro;
  return { x: r.x + left, y: r.y + top, w: Math.max(0, r.w - left - right), h: Math.max(0, r.h - top - bottom) };
}

function resolveSize(n: RNode, parent: Rect): { w: number; h: number } {
  const [xs, xo, ys, yo] = udim2(n.properties.Size, [0, 100, 0, 100]);
  const constraint = enumv(n.properties.SizeConstraint, "RelativeXY");
  const baseX = constraint === "RelativeYY" ? parent.h : parent.w;
  const baseY = constraint === "RelativeXX" ? parent.w : parent.h;
  let w = xs * baseX + xo;
  let h = ys * baseY + yo;

  const aspect = findChild(n, "UIAspectRatioConstraint");
  if (aspect) {
    const ratio = num(aspect.properties.AspectRatio, 1) || 1;
    const type = enumv(aspect.properties.AspectType, "FitWithinMaxSize");
    const axis = enumv(aspect.properties.DominantAxis, "Width");
    if (type === "ScaleWithParentSize") {
      if (axis === "Width") h = w / ratio;
      else w = h * ratio;
    } else if (w / Math.max(h, 1e-6) > ratio) w = h * ratio;
    else h = w / ratio;
  }
  const sc = findChild(n, "UISizeConstraint");
  if (sc) {
    const [minW, minH] = vec2(sc.properties.MinSize, [0, 0]);
    const [maxW, maxH] = vec2(sc.properties.MaxSize, [Infinity, Infinity]);
    w = Math.min(Math.max(w, minW), maxW);
    h = Math.min(Math.max(h, minH), maxH);
  }

  const auto = enumv(n.properties.AutomaticSize, "None");
  if (auto !== "None") {
    const text = n.properties.Text?.t === "string" ? n.properties.Text.v : "";
    const size = num(n.properties.TextSize, 14);
    if (text) {
      const tw = estimateTextWidth(text, size) + 8;
      if (auto === "X" || auto === "XY") w = Math.max(w, tw);
      if (auto === "Y" || auto === "XY") {
        const lines = auto === "Y" && w > 0 ? Math.ceil(tw / Math.max(w, 1)) : 1;
        h = Math.max(h, lines * size * 1.2 + 4);
      }
    }
  }
  return { w: Math.max(0, w), h: Math.max(0, h) };
}

function sortForLayout(children: RNode[], layout: RNode): RNode[] {
  const order = enumv(layout.properties.SortOrder, "LayoutOrder");
  const list = children.filter((c) => isGuiObject(c) && bool(c.properties.Visible, true));
  if (order === "Name") return list.sort((a, b) => a.name.localeCompare(b.name));
  if (order === "LayoutOrder") {
    return list
      .map((c, i) => ({ c, i }))
      .sort((a, b) => num(a.c.properties.LayoutOrder, 0) - num(b.c.properties.LayoutOrder, 0) || a.i - b.i)
      .map((x) => x.c);
  }
  return list;
}

export function layoutGui(root: RNode, viewport: { w: number; h: number }): LayoutBox {
  const screen: Rect = { x: 0, y: 0, w: viewport.w, h: viewport.h };
  let inset = 0;
  if (root.className === "ScreenGui" && !bool(root.properties.IgnoreGuiInset, false)) inset = TOPBAR_INSET;
  const rootRect: Rect = { x: 0, y: inset, w: screen.w, h: screen.h - inset };

  const layoutChildren = (n: RNode, content: Rect, scale: number, zBase: number): LayoutBox[] => {
    const guiKids = n.children.filter(isGuiObject);
    const list = findChild(n, "UIListLayout");
    const grid = findChild(n, "UIGridLayout");
    const page = findChild(n, "UIPageLayout");
    const uiScale = findChild(n, "UIScale");
    const s = scale * (uiScale ? num(uiScale.properties.Scale, 1) : 1);

    if (grid) {
      const [cxs, cxo, cys, cyo] = udim2(grid.properties.CellSize, [0, 100, 0, 100]);
      const [pxs, pxo, pys, pyo] = udim2(grid.properties.CellPadding, [0, 5, 0, 5]);
      const cw = cxs * content.w + cxo;
      const ch = cys * content.h + cyo;
      const px = pxs * content.w + pxo;
      const py = pys * content.h + pyo;
      const horizontal = enumv(grid.properties.FillDirection, "Horizontal") === "Horizontal";
      const maxCells = num(grid.properties.FillDirectionMaxCells, 0);
      const fitPrimary = horizontal ? Math.max(1, Math.floor((content.w + px) / (cw + px))) : Math.max(1, Math.floor((content.h + py) / (ch + py)));
      const perLine = maxCells > 0 ? Math.min(maxCells, fitPrimary) : fitPrimary;
      const items = sortForLayout(guiKids, grid);
      const lines = Math.ceil(items.length / perLine);
      const totalW = horizontal ? Math.min(items.length, perLine) * (cw + px) - px : lines * (cw + px) - px;
      const totalH = horizontal ? lines * (ch + py) - py : Math.min(items.length, perLine) * (ch + py) - py;
      const ox = alignOffset(enumv(grid.properties.HorizontalAlignment, "Left"), content.w, totalW);
      const oy = alignOffset(enumv(grid.properties.VerticalAlignment, "Top"), content.h, totalH, true);
      return items.map((c, i) => {
        const col = horizontal ? i % perLine : Math.floor(i / perLine);
        const row = horizontal ? Math.floor(i / perLine) : i % perLine;
        const rect = { x: content.x + ox + col * (cw + px), y: content.y + oy + row * (ch + py), w: cw, h: ch };
        return boxFor(c, rect, s, zBase, true);
      });
    }

    if (list || page) {
      const layout = (list ?? page)!;
      const horizontal = enumv(layout.properties.FillDirection, "Vertical") === "Horizontal";
      const [ps, po] = udim(layout.properties.Padding, [0, 0]);
      const pad = (horizontal ? content.w : content.h) * ps + po;
      const items = sortForLayout(guiKids, layout);
      if (page) {
        const first = items[0];
        return first ? [boxFor(first, content, s, zBase, true, true)] : [];
      }
      const sizes = items.map((c) => resolveSize(c, content));
      const total = sizes.reduce((acc, sz) => acc + (horizontal ? sz.w : sz.h), 0) + pad * Math.max(0, items.length - 1);
      let cursor = horizontal
        ? alignOffset(enumv(layout.properties.HorizontalAlignment, "Left"), content.w, total)
        : alignOffset(enumv(layout.properties.VerticalAlignment, "Top"), content.h, total, true);
      return items.map((c, i) => {
        const sz = sizes[i];
        let rect: Rect;
        if (horizontal) {
          const cross = alignOffset(enumv(layout.properties.VerticalAlignment, "Top"), content.h, sz.h, true);
          rect = { x: content.x + cursor, y: content.y + cross, w: sz.w, h: sz.h };
          cursor += sz.w + pad;
        } else {
          const cross = alignOffset(enumv(layout.properties.HorizontalAlignment, "Left"), content.w, sz.w);
          rect = { x: content.x + cross, y: content.y + cursor, w: sz.w, h: sz.h };
          cursor += sz.h + pad;
        }
        return boxFor(c, rect, s, zBase, true, true);
      });
    }

    return guiKids.map((c) => {
      const sz = resolveSize(c, content);
      const [pxs, pxo, pys, pyo] = udim2(c.properties.Position, [0, 0, 0, 0]);
      const [ax, ay] = vec2(c.properties.AnchorPoint, [0, 0]);
      const rect = {
        x: content.x + pxs * content.w + pxo - ax * sz.w,
        y: content.y + pys * content.h + pyo - ay * sz.h,
        w: sz.w,
        h: sz.h,
      };
      return boxFor(c, rect, s, zBase, false, true);
    });
  };

  const boxFor = (n: RNode, rect: Rect, scale: number, zBase: number, laidOut: boolean, sized = false): LayoutBox => {
    let r = rect;
    if (!sized && !laidOut) r = rect;
    if (scale !== 1) {
      // UIScale scales around the parent's origin; approximate by scaling size and offset.
      r = { x: r.x * scale, y: r.y * scale, w: r.w * scale, h: r.h * scale };
    }
    const content = paddedRect(n, r);
    const z = num(n.properties.ZIndex, 1);
    const scrolling = n.className === "ScrollingFrame";
    let childContent = content;
    if (scrolling) {
      const [cxs, cxo, cys, cyo] = udim2(n.properties.CanvasSize, [0, 0, 2, 0]);
      childContent = { x: content.x, y: content.y, w: Math.max(content.w, cxs * r.w + cxo), h: Math.max(content.h, cys * r.h + cyo) };
    }
    return {
      node: n,
      ...r,
      rotation: num(n.properties.Rotation, 0),
      zIndex: zBase + z,
      visible: bool(n.properties.Visible, true),
      clip: bool(n.properties.ClipsDescendants, false) || scrolling,
      laidOut,
      scale,
      children: layoutChildren(n, childContent, scale, zBase + z * 0.001),
    };
  };

  const enabled = bool(root.properties.Enabled, true);
  if (isGuiObject(root)) return boxFor(root, resolveRect(root, rootRect), 1, 0, false);
  return {
    node: root,
    ...rootRect,
    rotation: 0,
    zIndex: 0,
    visible: enabled,
    clip: false,
    laidOut: false,
    scale: 1,
    children: layoutChildren(root, rootRect, 1, 0),
  };
}

function resolveRect(n: RNode, parent: Rect): Rect {
  const sz = resolveSize(n, parent);
  const [pxs, pxo, pys, pyo] = udim2(n.properties.Position, [0, 0, 0, 0]);
  const [ax, ay] = vec2(n.properties.AnchorPoint, [0, 0]);
  return { x: parent.x + pxs * parent.w + pxo - ax * sz.w, y: parent.y + pys * parent.h + pyo - ay * sz.h, w: sz.w, h: sz.h };
}

function alignOffset(align: string, space: number, used: number, vertical = false): number {
  const start = vertical ? "Top" : "Left";
  const end = vertical ? "Bottom" : "Right";
  if (align === "Center") return (space - used) / 2;
  if (align === end) return space - used;
  void start;
  return 0;
}

/** Find the deepest visible box at a point, for click-to-select in the editor. */
export function hitTest(box: LayoutBox, x: number, y: number): LayoutBox | undefined {
  if (!box.visible) return undefined;
  const inside = x >= box.x && y >= box.y && x <= box.x + box.w && y <= box.y + box.h;
  if (box.clip && !inside) return undefined;
  const kids = [...box.children].sort((a, b) => b.zIndex - a.zIndex);
  for (const c of kids) {
    const hit = hitTest(c, x, y);
    if (hit) return hit;
  }
  return inside && isGuiObject(box.node) ? box : undefined;
}

export function flattenBoxes(box: LayoutBox): LayoutBox[] {
  const out: LayoutBox[] = [];
  const go = (b: LayoutBox) => {
    out.push(b);
    b.children.forEach(go);
  };
  go(box);
  return out;
}
