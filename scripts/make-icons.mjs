// Generates the app icons (PNG + favicon.svg): the brand bee on a cream square.
// Zero dependencies, supersampled. Colours come from src/config.ts. Run via `npm run icons`.
import { deflateSync, crc32 } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { config } from '../src/config.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const [DARK, YELLOW, WHITE, BG] = ['#2a2a20', '#e8c33a', '#ffffff', config.iconBackground].map(hex);

// Bee in its own units (brand logo geometry), outline width W, drawn centred at C, tilted -8 deg.
const W = 3.6, C = [2, -9], SCALE = 0.0086, TILT = (8 * Math.PI) / 180;
const quad = (p0, p1, p2) => Array.from({ length: 9 }, (_, i) => {
  const t = i / 8, a = (1 - t) ** 2, b = 2 * t * (1 - t), c = t * t;
  return [a * p0[0] + b * p1[0] + c * p2[0], a * p0[1] + b * p1[1] + c * p2[1]];
});
const ell = (cx, cy, rx, ry, rot, fill) => ({ cx, cy, rx, ry, rot: (rot * Math.PI) / 180, fill, outline: true });
const body = ell(0, 0, 27, 18, 0, YELLOW);
const stripes = [-15, -3, 9];
const antennae = [quad([33, -11], [36, -20], [42, -22]), quad([28, -11], [28, -21], [32, -25])];
const stinger = [[-27, 0], [-37, -3], [-37, 6]];

// Inside tests in bee units; g grows the shape (for the outline).
const inEll = (e, x, y, g) => {
  const dx = x - e.cx, dy = y - e.cy, c = Math.cos(e.rot), s = Math.sin(e.rot);
  const px = dx * c + dy * s, py = -dx * s + dy * c;
  return (px / (e.rx + g)) ** 2 + (py / (e.ry + g)) ** 2 <= 1;
};
const inPoly = (poly, x, y) => {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % poly.length];
    const c = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    if (c !== 0 && sign !== 0 && Math.sign(c) !== sign) return false;
    if (c !== 0) sign = Math.sign(c);
  }
  return true;
};
const nearLine = (pts, x, y, r) => pts.slice(1).some(([bx, by], i) => {
  const [ax, ay] = pts[i], l2 = (bx - ax) ** 2 + (by - ay) ** 2;
  const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / l2));
  return (x - ax - t * (bx - ax)) ** 2 + (y - ay - t * (by - ay)) ** 2 <= r * r;
});
const shapes = [
  ell(-6, -24, 9, 14, -25, WHITE), ell(8, -24, 9, 14, 20, WHITE),
  body, ell(31, -2, 10, 10, 0, YELLOW),
];
// Colour of the bee at a bee-unit point, or null outside it.
function bee(x, y) {
  if (inPoly(stinger, x, y)) return DARK;
  if (antennae.some((a) => nearLine(a, x, y, W / 2))) return DARK;
  let col = null;
  for (const e of shapes) {
    if (inEll(e, x, y, W / 2)) col = DARK;
    if (inEll(e, x, y, -W / 2)) col = e.fill;
    if (e === body && inEll(e, x, y, 0) && stripes.some((sx) => x >= sx && x <= sx + 6)) col = DARK;
  }
  if (inEll(ell(35, -4, 1.8, 1.8, 0), x, y, 0)) col = DARK;
  return col;
}

const inRound = (r, x, y) => {
  const dx = Math.max(r - x, x - (1 - r), 0), dy = Math.max(r - y, y - (1 - r), 0);
  return dx * dx + dy * dy <= r * r;
};
const SS = 4;
function render(size, rounded) {
  const raw = Buffer.alloc(size * (size * 4 + 1)); // filter byte 0 per row
  const cos = Math.cos(TILT), sin = Math.sin(TILT);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    for (let x = 0; x < size; x++) {
      let cover = 0;
      const sum = [0, 0, 0];
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const u = (x + (sx + 0.5) / SS) / size, v = (y + (sy + 0.5) / SS) / size;
        if (rounded && !inRound(0.2, u, v)) continue;
        cover++;
        const px = (u - 0.5) / SCALE, py = (v - 0.5) / SCALE;
        const col = bee(px * cos - py * sin + C[0], px * sin + py * cos + C[1]) || BG;
        for (let c = 0; c < 3; c++) sum[c] += col[c];
      }
      const o = row + 1 + x * 4;
      for (let c = 0; c < 3; c++) raw[o + c] = Math.round(sum[c] / (cover || 1));
      raw[o + 3] = Math.round((255 * cover) / (SS * SS));
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

const d = '#2a2a20', y = '#e8c33a';
const antennaPath = 'M 33 -11 Q 36 -20 42 -22 M 28 -11 Q 28 -21 32 -25';
out('public/favicon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">\n` +
  `  <rect width="100" height="100" rx="20" fill="#${config.iconBackground.slice(1)}"/>\n` +
  `  <g transform="translate(50 50) scale(${SCALE * 100}) rotate(-8) translate(${-C[0]} ${-C[1]})" stroke="${d}" stroke-width="${W}" stroke-linejoin="round">\n` +
  `    <clipPath id="b"><ellipse rx="27" ry="18"/></clipPath>\n` +
  `    <ellipse cx="-6" cy="-24" rx="9" ry="14" transform="rotate(-25 -6 -24)" fill="#fff"/>\n` +
  `    <ellipse cx="8" cy="-24" rx="9" ry="14" transform="rotate(20 8 -24)" fill="#fff"/>\n` +
  `    <polygon points="${stinger.map((p) => p.join(',')).join(' ')}" fill="${d}"/>\n` +
  `    <ellipse rx="27" ry="18" fill="${y}"/>\n` +
  `    <g clip-path="url(#b)" stroke="none" fill="${d}">${stripes.map((x) => `<rect x="${x}" y="-20" width="6" height="40"/>`).join('')}</g>\n` +
  `    <circle cx="31" cy="-2" r="10" fill="${y}"/>\n` +
  `    <circle cx="35" cy="-4" r="1.8" fill="${d}" stroke="none"/>\n` +
  `    <path d="${antennaPath}" fill="none" stroke-linecap="round"/>\n` +
  `  </g>\n</svg>\n`);
console.log('icons written');
