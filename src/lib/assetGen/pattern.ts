import { PALETTES, resolveColor } from "./palette";

// Backgrounds, as tileable SVG.
//
// The shape generator draws one object. A page needs a surface, and a student
// asking for "a nice background" gets either a flat colour or a three-stop
// gradient that looks like every other AI-made page. These are patterns: they
// tile seamlessly, they are a few hundred bytes, and they scale to any screen.
//
// Tiling is the whole difficulty and the reason this is not just more shapes.
// A motif drawn near an edge must reappear on the opposite edge or the seam is
// visible the moment the tile repeats — so every pattern here is drawn in a
// square that wraps, and the checks assert the geometry stays inside it.

export type PatternKind = "dots" | "grid" | "checker" | "stripes" | "diagonal" | "waves" | "stars" | "hex";

export interface PatternSpec {
  kind?: PatternKind;
  /** Tile size in pixels. The motif repeats every `size`. */
  size?: number;
  background?: string;
  color?: string;
  /** Motif scale within the tile, 0-1. */
  scale?: number;
  /** A named palette to take background and colour from. */
  palette?: string;
}

function num(value: number | undefined, fallback: number, min: number, max: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
}

export function renderPattern(spec: PatternSpec): string {
  const kind = spec.kind ?? "dots";
  const size = num(spec.size, 40, 8, 200);
  const palette = spec.palette ? PALETTES[spec.palette] : undefined;
  const background = resolveColor(spec.background, palette?.background ?? "#0d0d0d");
  const color = resolveColor(spec.color, palette?.accent ?? "#2a2a2a");
  const scale = num(spec.scale, 0.3, 0.02, 1);
  const s = size;
  const r = (s * scale) / 2;

  let motif: string;
  // Set by the kinds that turn the lattice rather than the motif.
  let transform = "";
  switch (kind) {
    case "grid": {
      const w = Math.max(0.5, s * scale * 0.12);
      // TOP AND LEFT ONLY. Drawing all four edges looks symmetrical and is
      // wrong: tile A's right edge lands on tile B's left edge, so every seam
      // is twice the weight of the lines inside the tile and the grid reads as
      // a plaid. Two edges tile into a complete lattice because the neighbour
      // supplies the other two.
      motif = `<path d="M0 0 H${s} M0 0 V${s}" stroke="${color}" stroke-width="${w}" fill="none"/>`;
      break;
    }
    case "checker":
      motif =
        `<rect width="${s / 2}" height="${s / 2}" fill="${color}"/>` +
        `<rect x="${s / 2}" y="${s / 2}" width="${s / 2}" height="${s / 2}" fill="${color}"/>`;
      break;
    case "stripes": {
      const w = s * scale;
      motif = `<rect width="${w}" height="${s}" fill="${color}"/>`;
      break;
    }
    case "diagonal": {
      // A rotated stripe, not a hand-placed line.
      //
      // The hand-placed version drew y = -x, which passes through the tile's
      // corner and nowhere else, so the pattern rendered as an almost-empty
      // square — visible only once it was on screen. Rotating the whole pattern
      // is the idiomatic SVG answer and is seamless by construction: the tile
      // still contains a plain vertical stripe, and patternTransform turns the
      // lattice rather than the geometry.
      motif = `<rect width="${s * scale}" height="${s}" fill="${color}"/>`;
      transform = ' patternTransform="rotate(45)"';
      break;
    }
    case "waves": {
      const a = s * scale * 0.5;
      const w = Math.max(1, s * scale * 0.25);
      // A full sine period across the tile, so the height and slope match at
      // both edges. Half a period would step at the seam.
      motif =
        `<path d="M0 ${s / 2} q ${s / 4} ${-a} ${s / 2} 0 t ${s / 2} 0" ` +
        `stroke="${color}" stroke-width="${w}" fill="none"/>`;
      break;
    }
    case "stars": {
      const pts: string[] = [];
      for (let i = 0; i < 10; i++) {
        const angle = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const rad = i % 2 === 0 ? r : r * 0.4;
        pts.push(`${(s / 2 + Math.cos(angle) * rad).toFixed(2)},${(s / 2 + Math.sin(angle) * rad).toFixed(2)}`);
      }
      motif = `<polygon points="${pts.join(" ")}" fill="${color}"/>`;
      break;
    }
    case "hex": {
      const pts: string[] = [];
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
        pts.push(`${(s / 2 + Math.cos(angle) * r).toFixed(2)},${(s / 2 + Math.sin(angle) * r).toFixed(2)}`);
      }
      motif = `<polygon points="${pts.join(" ")}" fill="none" stroke="${color}" stroke-width="${Math.max(1, r * 0.18)}"/>`;
      break;
    }
    default: {
      // A dot at the centre and one at every corner: the corner quarters
      // combine across the seam into a whole dot, which is what makes the
      // repeat read as a lattice rather than as rows of tiles.
      motif =
        `<circle cx="${s / 2}" cy="${s / 2}" r="${r}" fill="${color}"/>` +
        `<circle cx="0" cy="0" r="${r}" fill="${color}"/>` +
        `<circle cx="${s}" cy="0" r="${r}" fill="${color}"/>` +
        `<circle cx="0" cy="${s}" r="${r}" fill="${color}"/>` +
        `<circle cx="${s}" cy="${s}" r="${r}" fill="${color}"/>`;
    }
  }

  // Emitted as a <pattern> so one file tiles any element at any size. A bare
  // motif would have to be repeated by CSS with background-repeat, which works
  // until the element is not a multiple of the tile.
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">` +
    `<defs><pattern id="p" width="${s}" height="${s}" patternUnits="userSpaceOnUse"${transform}>` +
    `${transform ? "" : `<rect width="${s}" height="${s}" fill="${background}"/>`}${motif}</pattern></defs>` +
    `<rect width="${s}" height="${s}" fill="${background}"/>` +
    `<rect width="${s}" height="${s}" fill="url(#p)"/></svg>\n`
  );
}
