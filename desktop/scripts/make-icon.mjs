// Renders the PLACEHOLDER app icon source (1024x1024 PNG) with no dependencies
// beyond Node's built-in zlib: a deep-indigo (#3730a3) rounded square with a
// white lowercase "r" built from simple shapes. Replace with real brand art
// before a public launch, then re-run `npm run icons`.
//
// Usage: node scripts/make-icon.mjs [out.png]   (default: src-tauri/icons/source.png)
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(process.argv[2] ?? resolve(here, "../src-tauri/icons/source.png"));

const SIZE = 1024;
const SS = 4; // supersampling per axis, for anti-aliased edges
const BG = [0x37, 0x30, 0xa3];
const FG = [0xff, 0xff, 0xff];

// Rounded square on the macOS icon grid (824px body, 100px margin).
const SQ = { x0: 100, y0: 100, x1: 924, y1: 924, r: 185 };
function inSquare(x, y) {
  const cx = Math.min(Math.max(x, SQ.x0 + SQ.r), SQ.x1 - SQ.r);
  const cy = Math.min(Math.max(y, SQ.y0 + SQ.r), SQ.y1 - SQ.r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= SQ.r ** 2;
}

// Lowercase "r": a vertical stem plus the upper part of a ring (the shoulder).
const DX = -58; // shifts the glyph so its visual centre sits on the canvas centre
const STROKE = 96;
const ARC = { cx: 600 + DX, cy: 480, ro: 160 };
ARC.ri = ARC.ro - STROKE;
const STEM = { x0: ARC.cx - ARC.ro, x1: ARC.cx - ARC.ro + STROKE, y0: ARC.cy - ARC.ro, y1: 724 };
function inR(x, y) {
  if (x >= STEM.x0 && x <= STEM.x1 && y >= STEM.y0 + 40 && y <= STEM.y1) return true;
  const dx = x - ARC.cx;
  const dy = y - ARC.cy;
  const d2 = dx * dx + dy * dy;
  if (d2 > ARC.ro ** 2 || d2 < ARC.ri ** 2 || dy > 0) return false;
  // Keep the left/top of the ring and end the shoulder ~35 degrees past vertical.
  const angleFromUp = Math.atan2(dx, -dy); // 0 = straight up, positive = to the right
  return angleFromUp <= (35 * Math.PI) / 180;
}

const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let py = 0; py < SIZE; py++) {
  const row = py * (SIZE * 4 + 1);
  raw[row] = 0; // PNG filter: none
  for (let px = 0; px < SIZE; px++) {
    let sq = 0;
    let glyph = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const x = px + (sx + 0.5) / SS;
        const y = py + (sy + 0.5) / SS;
        if (inSquare(x, y)) {
          sq++;
          if (inR(x, y)) glyph++;
        }
      }
    }
    const n = SS * SS;
    const a = sq / n;
    const g = sq ? glyph / sq : 0;
    const o = row + 1 + px * 4;
    for (let c = 0; c < 3; c++) raw[o + c] = Math.round(BG[c] * (1 - g) + FG[c] * g);
    raw[o + 3] = Math.round(a * 255);
  }
}

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, png);
console.log(`wrote ${out} (${png.length} bytes)`);
