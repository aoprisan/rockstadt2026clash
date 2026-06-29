// Generates PWA PNG icons with no external dependencies (uses Node's zlib).
// Draws the three festival stage colours as bold bars on a dark background
// with a white "clash" slash across them.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  // filter byte per scanline (0 = none)
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const hex = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

const BG = hex('#0d0b1f');
const GREEN = hex('#7ec524');
const PURPLE = hex('#c026d3');
const ORANGE = hex('#e2761b');
const WHITE = [245, 245, 250];

function draw(size, { maskable = false } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const pad = maskable ? size * 0.16 : size * 0.085; // safe-zone padding
  const inner = size - pad * 2;
  const radius = inner * 0.22;

  // three bars
  const gap = inner * 0.06;
  const barW = (inner - gap * 2) / 3;
  const bars = [GREEN, PURPLE, ORANGE];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let [r, g, b] = BG;

      const lx = x - pad;
      const ly = y - pad;
      const inBox = lx >= 0 && ly >= 0 && lx < inner && ly < inner;

      if (inBox) {
        // rounded-rect background panel (slightly lighter)
        const rrInside = roundedInside(lx, ly, inner, inner, radius);
        if (rrInside) {
          [r, g, b] = [22, 18, 44];

          // bars occupy vertical middle 78%
          const barTop = inner * 0.12;
          const barBot = inner * 0.88;
          if (ly >= barTop && ly <= barBot) {
            for (let i = 0; i < 3; i++) {
              const bx0 = i * (barW + gap);
              const bx1 = bx0 + barW;
              if (lx >= bx0 && lx <= bx1) {
                [r, g, b] = bars[i];
              }
            }
          }

          // white diagonal "clash" slash
          const slashHalf = inner * 0.05;
          const d = lx + ly - inner; // distance from main diagonal (bottom-left to top-right uses lx - ly)
          const diag = lx - ly;
          if (Math.abs(diag) < slashHalf) {
            [r, g, b] = WHITE;
          }
        }
      }

      const o = (y * size + x) * 4;
      rgba[o] = r;
      rgba[o + 1] = g;
      rgba[o + 2] = b;
      rgba[o + 3] = 255;
    }
  }
  return encodePNG(size, size, rgba);
}

function roundedInside(x, y, w, h, rad) {
  // corners
  const cx = Math.min(Math.max(x, rad), w - rad);
  const cy = Math.min(Math.max(y, rad), h - rad);
  const dx = x - cx;
  const dy = y - cy;
  if (x < rad || x > w - rad) {
    if (y < rad || y > h - rad) {
      return dx * dx + dy * dy <= rad * rad;
    }
  }
  return true;
}

const outDir = resolve(__dirname, '..', 'public');
mkdirSync(outDir, { recursive: true });

writeFileSync(resolve(outDir, 'icon-192.png'), draw(192));
writeFileSync(resolve(outDir, 'icon-512.png'), draw(512));
writeFileSync(resolve(outDir, 'icon-maskable-512.png'), draw(512, { maskable: true }));
writeFileSync(resolve(outDir, 'apple-touch-icon.png'), draw(180));
console.log('icons written to', outDir);
