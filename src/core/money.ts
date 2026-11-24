import type { Cents, UnitCost } from './types.ts';

const EPS = 1e-9;
const MAX_CENTS = 100_000_000; // €1,000,000 (§9)

// Round half away from zero, tolerant of float noise.
export function roundHalfUp(x: number): number {
  return Math.sign(x) * Math.floor(Math.abs(x) + 0.5 + EPS);
}

// Round a unit cost to 4 decimals of a cent (D-005).
export function roundCost(x: number): number {
  return roundHalfUp(x * 10000) / 10000;
}

const group = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// Cents as "€1,234.50"; negatives as "−€5.00".
export function formatMoney(cents: Cents): string {
  const abs = Math.abs(cents);
  const body = `€${group(Math.floor(abs / 100))}.${String(abs % 100).padStart(2, '0')}`;
  return cents < 0 ? `−${body}` : body;
}

// Unit cost in euros with 2 to 6 decimals, trailing zeros beyond 2 trimmed.
export function formatUnitCost(cost: UnitCost): string {
  const [int, frac] = (Math.abs(cost) / 100).toFixed(6).split('.');
  const body = `€${group(Number(int))}.${frac.replace(/0{1,4}$/, '')}`;
  return cost < 0 ? `−${body}` : body;
}

// With both "," and "." the last one is the decimal mark and the other groups thousands ("1,234.50", "1.234,50").
function dropThousands(s: string): string {
  const dec = s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.';
  const sep = dec === ',' ? '.' : ',';
  const parts = s.split(dec);
  const [int, frac] = parts;
  return parts.length === 2 && new RegExp(`^\\d{1,3}(\\${sep}\\d{3})+$`).test(int) ? `${int.replaceAll(sep, '')}.${frac}` : 'x';
}

// Parse euros text to a number of euros (max `maxDecimals` decimals), or null.
function parseEuros(text: string, maxDecimals: number): number | null {
  const t = text.replace(/[€\s]/g, '');
  const s = t.includes(',') && t.includes('.') ? dropThousands(t) : t.replace(',', '.');
  if (!new RegExp(`^\\d+(\\.\\d{1,${maxDecimals}})?$`).test(s)) return null;
  const euros = Number(s);
  return euros * 100 > MAX_CENTS ? null : euros;
}

// Euro text ("14", "14,50", "€ 14.5") to cents, or null when invalid.
export function parseMoney(text: string): Cents | null {
  const euros = parseEuros(text, 2);
  return euros === null ? null : roundHalfUp(euros * 100);
}

// Euro text (up to 6 decimals) to cents with up to 4 decimals, or null.
export function parseUnitCost(text: string): UnitCost | null {
  const euros = parseEuros(text, 6);
  return euros === null ? null : roundCost(euros * 100);
}
