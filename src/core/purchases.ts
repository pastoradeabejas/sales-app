// Purchases from suppliers: line unit cost, totals, validation, expense items (spec §16.3).
import { perBaseUnit } from './stock.ts';
import type { Cents, ProductClass, PurchaseLine, UnitCost } from './types.ts';

const MAX_CENTS = 100_000_000;

/** A catalogue class bought as an expense: no stock and never sold. */
export const isExpenseItem = (c: Pick<ProductClass, 'trackStock' | 'sellable'>): boolean => !c.trackStock && !c.sellable;

/** Cents per 1 base unit paid on a line. */
export const purchaseLineUnitCost = (l: Pick<PurchaseLine, 'amount' | 'lineTotal' | 'decimals'>): UnitCost =>
  perBaseUnit(l.lineTotal, l.amount, l.decimals);

export const purchaseTotal = (lines: Pick<PurchaseLine, 'lineTotal'>[]): Cents => lines.reduce((s, l) => s + l.lineTotal, 0);

/** Rule violations of a purchase; [] when valid. */
export function validatePurchase(p: { lines: Pick<PurchaseLine, 'amount' | 'lineTotal'>[] }): string[] {
  if (p.lines.length === 0) return ['add at least one line'];
  const errors: string[] = [];
  if (p.lines.some((l) => !(l.amount > 0))) errors.push('amounts must be > 0');
  if (p.lines.some((l) => !Number.isInteger(l.lineTotal) || l.lineTotal < 0 || l.lineTotal > MAX_CENTS)) errors.push('totals must be €0 to €1,000,000');
  return errors;
}
