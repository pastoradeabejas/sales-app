import { roundHalfUp } from './money.ts';
import type { Decimals, Scaled } from './types.ts';

const MAX_BASE_UNITS = 1_000_000;

// Amount text ("1,37" or "1.37") to scaled units, rounded half-up; null if invalid, <= 0 or too big.
export function parseAmount(text: string, decimals: Decimals): Scaled | null {
  const s = text.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const scaled = roundHalfUp(Number(s) * 10 ** decimals);
  return scaled <= 0 || scaled > MAX_BASE_UNITS * 10 ** decimals ? null : scaled;
}

// Item count text to an integer 1-9,999, or null.
export function parseQuantity(text: string): number | null {
  const s = text.trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n >= 1 && n <= 9999 ? n : null;
}

// Scaled amount as "1,234.5 kg"; trailing zeros trimmed unless opts.fixed; "−" for negatives.
export function formatAmount(
  scaled: Scaled,
  decimals: Decimals,
  unitName?: string,
  opts: { fixed?: boolean } = {},
): string {
  const abs = Math.abs(scaled);
  const factor = 10 ** decimals;
  let text = String(Math.floor(abs / factor)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (decimals > 0) {
    let frac = String(abs % factor).padStart(decimals, '0');
    if (!opts.fixed) frac = frac.replace(/0+$/, '');
    if (frac) text += `.${frac}`;
  }
  return `${scaled < 0 ? '−' : ''}${text}${unitName ? ` ${unitName}` : ''}`;
}

// Scaled units to base units (1370, 3 -> 1.37).
export function toBaseUnits(scaled: Scaled, decimals: Decimals): number {
  return scaled / 10 ** decimals;
}
