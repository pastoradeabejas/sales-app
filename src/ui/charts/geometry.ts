// Pure chart layout (spec §8.13): one coordinate system for bars and lines inside a viewBox.
export const VIEW = { w: 320, h: 180, left: 38, right: 8, top: 10, bottom: 24 };

export interface ChartPoint { key: string; label: string; paid: number; unpaid: number; total: number }

/** Round up to 1, 2, 5 or 10 times a power of ten (1 for an empty chart). */
export function niceMax(v: number): number {
  if (!(v > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(v) + 1e-9);
  const f = v / p;
  return (f <= 1.000001 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

function frame(n: number, peak: number) {
  const max = niceMax(peak);
  const plotH = VIEW.h - VIEW.top - VIEW.bottom;
  const bottom = VIEW.h - VIEW.bottom;
  const band = (VIEW.w - VIEW.left - VIEW.right) / Math.max(n, 1);
  const step = Math.max(1, Math.ceil(n / 6));
  return {
    max,
    band,
    bottom,
    h: (v: number) => (v / max) * plotH,
    cx: (i: number) => VIEW.left + band * (i + 0.5),
    ticks: [0, max / 2, max].map((value) => ({ value, y: bottom - (value / max) * plotH })),
    labelIdx: Array.from({ length: n }, (_, i) => i).filter((i) => i % step === 0),
  };
}

export function barGeometry(points: { paid: number; unpaid: number }[]) {
  const f = frame(points.length, Math.max(0, ...points.map((p) => p.paid + p.unpaid)));
  const w = Math.min(f.band * 0.7, 28);
  const bars = points.map((p, i) => {
    const paidH = f.h(p.paid);
    const unpaidH = f.h(p.unpaid);
    return { x: f.cx(i) - w / 2, w, paidH, paidY: f.bottom - paidH, unpaidH, unpaidY: f.bottom - paidH - unpaidH, cx: f.cx(i) };
  });
  return { max: f.max, ticks: f.ticks, bars, band: f.band, labelIdx: f.labelIdx };
}

export function lineGeometry(points: { total: number }[]) {
  const f = frame(points.length, Math.max(0, ...points.map((p) => p.total)));
  const pts = points.map((p, i) => ({ x: f.cx(i), y: f.bottom - f.h(p.total) }));
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  return { max: f.max, ticks: f.ticks, points: pts, band: f.band, labelIdx: f.labelIdx, path };
}

/** One bar per period: sales up from zero, net profit drawn over it (the rest is costs); a loss goes below the zero line. */
export function profitBarGeometry(points: { sales: number; net: number }[]) {
  const top = niceMax(Math.max(0, ...points.flatMap((p) => [p.sales, p.net])));
  const lowest = Math.min(0, ...points.map((p) => p.net));
  const low = lowest < 0 ? niceMax(-lowest) : 0;
  const f = frame(points.length, top);
  const scale = (VIEW.h - VIEW.top - VIEW.bottom) / (top + low);
  const zeroY = VIEW.top + top * scale;
  const w = Math.min(f.band * 0.7, 28);
  const bars = points.map((p, i) => {
    const netH = Math.abs(p.net) * scale;
    return {
      cx: f.cx(i), w,
      salesX: f.cx(i) - w / 2, salesH: p.sales * scale, salesY: zeroY - p.sales * scale,
      netX: f.cx(i) - w / 2, netH, netY: p.net < 0 ? zeroY : zeroY - netH, loss: p.net < 0,
    };
  });
  const ticks = (low ? [-low, 0, top] : [0, top / 2, top]).map((value) => ({ value, y: zeroY - value * scale }));
  return { ticks, zeroY, bars, band: f.band, labelIdx: f.labelIdx };
}
