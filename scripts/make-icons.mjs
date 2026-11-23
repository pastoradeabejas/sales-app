// Generates placeholder app icons (PNG + favicon.svg): a white open book on the
// accent colour. Colours come from src/config.ts. Run via `npm run icons`.
import { deflateSync, crc32 } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { config } from '../src/config.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const left = [[0.22, 0.32], [0.48, 0.36], [0.48, 0.72], [0.22, 0.68]];
const right = left.map(([x, y]) => [1 - x, y]).reverse();
const pages = [left, right];
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const accent = hex(config.themeColor);

// Point inside a convex polygon (consistent sign of cross products).
const inPoly = (poly, px, py) => {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % poly.length];
    const c = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
    if (c !== 0 && sign !== 0 && Math.sign(c) !== sign) return false;
    if (c !== 0) sign = Math.sign(c);
  }
  return true;
};
// Point inside a unit square with rounded corners of radius r.
const inRound = (r, x, y) => {
  const dx = Math.max(r - x, x - (1 - r), 0), dy = Math.max(r - y, y - (1 - r), 0);
  return dx * dx + dy * dy <= r * r;
};

const SS = 4;
function render(size, rounded) {
  const raw = Buffer.alloc(size * (size * 4 + 1)); // filter byte 0 per row
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    for (let x = 0; x < size; x++) {
      let cover = 0, white = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const u = (x + (sx + 0.5) / SS) / size, v = (y + (sy + 0.5) / SS) / size;
        if (rounded && !inRound(0.2, u, v)) continue;
        cover++;
        if (pages.some((p) => inPoly(p, u, v))) white++;
      }
      const n = SS * SS, o = row + 1 + x * 4;
      for (let c = 0; c < 3; c++) raw[o + c] = Math.round((accent[c] * (cover - white) + 255 * white) / (cover || 1));
      raw[o + 3] = Math.round((255 * cover) / n);
    }
  }
  return raw;
}

function png(size, rounded) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(render(size, rounded))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(path.join(root, 'public/icons'), { recursive: true });
const out = (file, data) => writeFileSync(path.join(root, file), data);
out('public/icons/icon-192.png', png(192, true));
out('public/icons/icon-512.png', png(512, true));
out('public/icons/maskable-512.png', png(512, false));
out('public/icons/apple-touch-180.png', png(180, false));

const pts = (p) => p.map(([x, y]) => `${x * 100},${y * 100}`).join(' ');
out('public/favicon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">\n` +
  `  <rect width="100" height="100" rx="20" fill="${config.themeColor}"/>\n` +
  pages.map((p) => `  <polygon points="${pts(p)}" fill="#fff"/>\n`).join('') +
  `</svg>\n`);
console.log('icons written');
