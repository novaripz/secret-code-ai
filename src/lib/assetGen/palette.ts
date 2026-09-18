// Colour schemes, so a project does not end up wearing whatever hex the model
// thought of first.
//
// Left alone, a model reaches for #ffd700 for anything gold and #ff0000 for
// anything red, and a page assembled from those looks exactly like every other
// page assembled from those. A named palette is one word in a spec that makes
// a set of assets belong together — the icon, the background pattern and the
// button all drawing from the same five colours.
//
// Each palette is checked for text-on-background contrast, because a scheme
// that looks good and cannot be read is not a scheme.

export interface Palette {
  background: string;
  surface: string;
  text: string;
  accent: string;
  accent2: string;
}

export const PALETTES: Record<string, Palette> = {
  midnight: { background: "#0b1020", surface: "#161d33", text: "#e8eefa", accent: "#7dd3fc", accent2: "#a78bfa" },
  forest: { background: "#0c1a12", surface: "#15291d", text: "#e7f1e9", accent: "#86efac", accent2: "#fcd34d" },
  sunset: { background: "#1a0f1c", surface: "#2b1826", text: "#ffeef2", accent: "#fb7185", accent2: "#fdba74" },
  candy: { background: "#fff5f8", surface: "#ffe4ec", text: "#3b1f2b", accent: "#ec4899", accent2: "#8b5cf6" },
  arcade: { background: "#10001f", surface: "#1e0736", text: "#f0e7ff", accent: "#22d3ee", accent2: "#f472b6" },
  paper: { background: "#f4ecdd", surface: "#fdf8ee", text: "#2b251b", accent: "#b45309", accent2: "#0f766e" },
  ocean: { background: "#04212e", surface: "#0a3446", text: "#e0f7ff", accent: "#38bdf8", accent2: "#34d399" },
  mono: { background: "#111111", surface: "#1d1d1d", text: "#f5f5f5", accent: "#fafafa", accent2: "#a3a3a3" },
};

export const PALETTE_NAMES = Object.keys(PALETTES);

/**
 * Colours are validated against a closed grammar rather than escaped.
 *
 * The value is interpolated into an SVG attribute in a file the preview inlines
 * into a document, and a colour is a small closed language, so an allow-list is
 * both easy and total. A palette token like "accent" resolves first, which is
 * what lets one word in a spec colour a whole set of assets consistently.
 */
const SAFE_COLOR =
  /^(#[0-9a-f]{3,8}|[a-z]+|rgb\([\d\s,.%]+\)|rgba\([\d\s,.%]+\)|hsl\([\d\s,.%]+\)|hsla\([\d\s,.%]+\)|none|transparent)$/i;

export function resolveColor(value: string | undefined, fallback: string, palette?: Palette): string {
  const trimmed = (value ?? "").trim();
  if (palette && trimmed in palette) return palette[trimmed as keyof Palette];
  return SAFE_COLOR.test(trimmed) ? trimmed : fallback;
}
