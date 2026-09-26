// A dependency-free PNG encoder (RGBA8, stored deflate blocks) and the
// procedural patterns textures are generated from. Stored blocks make larger
// files than zlib would, which is irrelevant at 256x256 and means the core
// runs unchanged in the browser and on the server.

import type { TEXTURE_PATTERNS } from "./spec";

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array, start = 0, end = bytes.length): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1, b = 0;
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function zlibStored(data: Uint8Array): Uint8Array {
  const blocks = Math.ceil(data.length / 65535) || 1;
  const out = new Uint8Array(2 + data.length + blocks * 5 + 4);
  out[0] = 0x78;
  out[1] = 0x01;
  let o = 2;
  for (let b = 0; b < blocks; b++) {
    const start = b * 65535;
    const len = Math.min(65535, data.length - start);
    out[o++] = b === blocks - 1 ? 1 : 0;
    out[o++] = len & 255;
    out[o++] = len >> 8;
    out[o++] = ~len & 255;
    out[o++] = (~len >> 8) & 255;
    out.set(data.subarray(start, start + len), o);
    o += len;
  }
  const ad = adler32(data);
  out[o++] = ad >>> 24;
  out[o++] = (ad >>> 16) & 255;
  out[o++] = (ad >>> 8) & 255;
  out[o++] = ad & 255;
  return out;
}

export function encodePng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const raw = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  }
  const idat = zlibStored(raw);
  const chunks: Uint8Array[] = [];
  const chunk = (type: string, data: Uint8Array) => {
    const buf = new Uint8Array(12 + data.length);
    const dv = new DataView(buf.buffer);
    dv.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) buf[4 + i] = type.charCodeAt(i);
    buf.set(data, 8);
    dv.setUint32(8 + data.length, crc32(buf, 4, 8 + data.length));
    chunks.push(buf);
  };
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  chunk("IHDR", ihdr);
  chunk("IDAT", idat);
  chunk("IEND", new Uint8Array(0));
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  const total = sig.length + chunks.reduce((a, c) => a + c.length, 0);
  const out = new Uint8Array(total);
  out.set(sig, 0);
  let o = sig.length;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

/** Deterministic value noise, so the same spec always produces the same texture. */
function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function smoothNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const s = (t: number) => t * t * (3 - 2 * t);
  const a = hash(xi, yi, seed), b = hash(xi + 1, yi, seed), c = hash(xi, yi + 1, seed), d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * s(xf) + (c - a) * s(yf) + (a - b - c + d) * s(xf) * s(yf);
}

export function patternTexture(
  pattern: (typeof TEXTURE_PATTERNS)[number],
  c1: [number, number, number],
  c2: [number, number, number],
  size = 256,
  seed = 7,
): Uint8Array {
  const px = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      let t = 0;
      switch (pattern) {
        case "checker":
          t = (Math.floor(u * 8) + Math.floor(v * 8)) % 2;
          break;
        case "stripes":
          t = Math.floor(u * 10) % 2;
          break;
        case "tiles": {
          const gu = (u * 4) % 1, gv = (v * 4) % 1;
          t = gu < 0.04 || gv < 0.04 ? 1 : smoothNoise(u * 16, v * 16, seed) * 0.25;
          break;
        }
        case "bricks": {
          const row = Math.floor(v * 8);
          const off = row % 2 ? 0.125 : 0;
          const gu = ((u + off) * 4) % 1, gv = (v * 8) % 1;
          t = gu < 0.05 || gv < 0.1 ? 1 : smoothNoise(u * 24, v * 24, seed) * 0.3;
          break;
        }
        case "planks": {
          const plank = Math.floor(v * 6);
          const grain = smoothNoise(u * 3 + plank * 5, v * 60, seed + plank) * 0.6 + smoothNoise(u * 20, v * 200, seed) * 0.2;
          const seam = (v * 6) % 1 < 0.04 ? 1 : 0;
          t = Math.min(1, grain + seam);
          break;
        }
        case "noise":
          t = smoothNoise(u * 8, v * 8, seed) * 0.6 + smoothNoise(u * 32, v * 32, seed + 1) * 0.4;
          break;
      }
      const i = (y * size + x) * 4;
      for (let k = 0; k < 3; k++) px[i + k] = Math.round((c1[k] * (1 - t) + c2[k] * t) * 255);
      px[i + 3] = 255;
    }
  }
  return encodePng(size, size, px);
}
