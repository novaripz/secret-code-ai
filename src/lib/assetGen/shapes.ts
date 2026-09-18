// Shapes as real SVG files, with the geometry done properly.
//
// Panda can already write an SVG by hand — it is text — and for a rectangle it
// should. What it is bad at, and what students ask for constantly, is anything
// with trigonometry in it: a five-pointed star, a regular hexagon, a gear, a
// ring segment. Asked for those it produces a path that is almost right, which
// is worse than wrong because nobody notices until it is on screen and lopsided.
//
// So the arithmetic lives here, where it is written once and checked, and the
// model asks for "star, 5 points" instead of trying to remember that the inner
// radius of a five-pointed star is 0.382 of the outer one.
//
// SVG rather than PNG on purpose: it is text, so it diffs, it stays sharp at
// any size, a student can open it and change a number, and it costs a few
// hundred bytes instead of a few hundred kilobytes.

export type ShapeKind =
  | "circle"
  | "rect"
  | "star"
  | "polygon"
  | "heart"
  | "triangle"
  | "gear"
  | "blob";

export interface ShapeSpec {
  kind?: ShapeKind;
  size?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  /** Points for a star, sides for a polygon, teeth for a gear. */
  points?: number;
  /** Corner rounding on a rect, 0–50% of the smaller side. */
  radius?: number;
  /** A second colour turns the fill into a vertical gradient. */
  fill2?: string;
}

const SAFE_COLOR = /^(#[0-9a-f]{3,8}|[a-z]+|rgb\([\d\s,.%]+\)|rgba\([\d\s,.%]+\)|hsl\([\d\s,.%]+\)|hsla\([\d\s,.%]+\)|none|transparent)$/i;

/**
 * Colours are validated, not escaped.
 *
 * This value is interpolated into an SVG attribute and the result is stored as
 * a project file that the preview inlines into a document. A colour is a short
 * closed grammar, so an allow-list is both easy and total — whereas escaping a
 * free string into markup is the kind of thing that looks fine until someone
 * finds the case it misses. Anything unrecognised falls back rather than
 * failing, because a shape in the wrong colour is a far better outcome for a
 * student than no shape and an error.
 */
function color(value: string | undefined, fallback: string): string {
  const trimmed = (value ?? "").trim();
  return SAFE_COLOR.test(trimmed) ? trimmed : fallback;
}

function num(value: number | undefined, fallback: number, min: number, max: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
}

/** Points on a circle, starting at the top so shapes stand upright. */
function ring(cx: number, cy: number, radius: number, count: number, offset = 0): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2 + offset;
    out.push(`${round(cx + Math.cos(angle) * radius)},${round(cy + Math.sin(angle) * radius)}`);
  }
  return out;
}

/** Two decimals is under a tenth of a pixel at any size a student will use. */
function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export function renderShape(spec: ShapeSpec): string {
  const kind = spec.kind ?? "circle";
  const size = num(spec.size, 100, 8, 1000);
  const fill = color(spec.fill, "#7dd3fc");
  const fill2 = spec.fill2 ? color(spec.fill2, "") : "";
  const stroke = color(spec.stroke, "none");
  const strokeWidth = num(spec.strokeWidth, stroke === "none" ? 0 : 2, 0, size / 4);

  const c = size / 2;
  // Inset by the stroke so a stroked shape is not clipped by its own viewBox —
  // the classic SVG mistake, and one that only shows on the outline.
  const r = c - strokeWidth / 2 - 1;

  const gradient = fill2
    ? `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="${fill}"/><stop offset="1" stop-color="${fill2}"/>` +
      `</linearGradient></defs>`
    : "";
  const paint = fill2 ? "url(#g)" : fill;
  const strokeAttrs = stroke === "none" ? "" : ` stroke="${stroke}" stroke-width="${strokeWidth}"`;

  let body: string;
  switch (kind) {
    case "rect": {
      const rad = num(spec.radius, 0, 0, size / 2);
      const inset = strokeWidth / 2 + 1;
      body = `<rect x="${inset}" y="${inset}" width="${round(size - inset * 2)}" height="${round(size - inset * 2)}" rx="${round(rad)}" fill="${paint}"${strokeAttrs}/>`;
      break;
    }
    case "triangle":
      body = `<polygon points="${ring(c, c, r, 3).join(" ")}" fill="${paint}"${strokeAttrs}/>`;
      break;
    case "polygon": {
      const sides = Math.round(num(spec.points, 6, 3, 24));
      body = `<polygon points="${ring(c, c, r, sides).join(" ")}" fill="${paint}"${strokeAttrs}/>`;
      break;
    }
    case "star": {
      const points = Math.round(num(spec.points, 5, 3, 20));
      // The inner radius that makes a star look like a star. For five points
      // this is the golden-ratio value (≈0.382); the formula generalises it so
      // a seven-pointed star is not accidentally a spiky circle.
      const inner = r * (points <= 4 ? 0.45 : Math.cos(Math.PI / points) / Math.cos(Math.PI / (2 * points)) * 0.62);
      const outerPts = ring(c, c, r, points);
      const innerPts = ring(c, c, inner, points, Math.PI / points);
      const interleaved: string[] = [];
      for (let i = 0; i < points; i++) {
        interleaved.push(outerPts[i], innerPts[i]);
      }
      body = `<polygon points="${interleaved.join(" ")}" fill="${paint}"${strokeAttrs}/>`;
      break;
    }
    case "heart": {
      // Two arcs meeting at a point. Written as a path with explicit cubic
      // curves rather than the usual copied one-liner, so the proportions scale
      // with `size` instead of only working at 100.
      const s = size / 100;
      const d =
        `M ${round(50 * s)} ${round(88 * s)} ` +
        `C ${round(18 * s)} ${round(66 * s)} ${round(6 * s)} ${round(44 * s)} ${round(20 * s)} ${round(28 * s)} ` +
        `C ${round(32 * s)} ${round(15 * s)} ${round(46 * s)} ${round(20 * s)} ${round(50 * s)} ${round(32 * s)} ` +
        `C ${round(54 * s)} ${round(20 * s)} ${round(68 * s)} ${round(15 * s)} ${round(80 * s)} ${round(28 * s)} ` +
        `C ${round(94 * s)} ${round(44 * s)} ${round(82 * s)} ${round(66 * s)} ${round(50 * s)} ${round(88 * s)} Z`;
      body = `<path d="${d}" fill="${paint}"${strokeAttrs}/>`;
      break;
    }
    case "gear": {
      const teeth = Math.round(num(spec.points, 8, 3, 24));
      // A gear tooth has a FLAT TOP and slanted flanks. The obvious
      // implementation — alternating points on an outer and an inner ring — is
      // what this was first, and it draws a spiky star with a hole in it. Four
      // points per tooth is the least that gives a real profile: up, across the
      // top, down, across the valley.
      const step = (Math.PI * 2) / teeth;
      const inner = r * 0.74;
      const pts: string[] = [];
      for (let i = 0; i < teeth; i++) {
        const a = i * step - Math.PI / 2;
        const at = (angle: number, radius: number) =>
          `${round(c + Math.cos(angle) * radius)},${round(c + Math.sin(angle) * radius)}`;
        pts.push(
          at(a + step * 0.06, r),   // tooth top, leading edge
          at(a + step * 0.44, r),   // tooth top, trailing edge
          at(a + step * 0.56, inner), // down into the valley
          at(a + step * 0.94, inner), // along the valley floor
        );
      }
      // The bore is a real hole rather than a grey disc: a second subpath wound
      // the other way with evenodd, so whatever is behind the gear shows
      // through it. A painted centre was a hard-coded colour that looked wrong
      // on every theme but the dark one.
      const bore = r * 0.26;
      const hole =
        `M ${round(c - bore)} ${round(c)} ` +
        `a ${round(bore)} ${round(bore)} 0 1 0 ${round(bore * 2)} 0 ` +
        `a ${round(bore)} ${round(bore)} 0 1 0 ${round(-bore * 2)} 0 Z`;
      body = `<path d="M ${pts.join(" L ")} Z ${hole}" fill-rule="evenodd" fill="${paint}"${strokeAttrs}/>`;
      break;
    }
    case "blob": {
      // A closed loop through points on a jittered circle, smoothed. Seeded off
      // the size so the same request gives the same blob rather than a new one
      // every time the file is regenerated.
      const lobes = Math.round(num(spec.points, 6, 3, 12));
      let seed = Math.floor(size * 13 + lobes * 7);
      const rand = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 0xffffffff;
      };
      const pts = Array.from({ length: lobes }, (_, i) => {
        const angle = (i / lobes) * Math.PI * 2 - Math.PI / 2;
        const rr = r * (0.72 + rand() * 0.28);
        return [c + Math.cos(angle) * rr, c + Math.sin(angle) * rr] as const;
      });
      let d = `M ${round(pts[0][0])} ${round(pts[0][1])}`;
      for (let i = 0; i < lobes; i++) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[(i + 1) % lobes];
        // Quadratic through the midpoint of each pair: a cheap smoothing that
        // gives a closed organic curve with no cusps.
        d += ` Q ${round(x1 + (x2 - x1) * 0.25 + (c - x1) * -0.15)} ${round(y1 + (y2 - y1) * 0.25 + (c - y1) * -0.15)} ${round((x1 + x2) / 2)} ${round((y1 + y2) / 2)}`;
      }
      body = `<path d="${d} Z" fill="${paint}"${strokeAttrs}/>`;
      break;
    }
    default:
      body = `<circle cx="${round(c)}" cy="${round(c)}" r="${round(r)}" fill="${paint}"${strokeAttrs}/>`;
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">` +
    `${gradient}${body}</svg>\n`
  );
}
