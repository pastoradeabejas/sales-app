import { roundCost, roundHalfUp } from './money.ts';
import { formatAmount } from './quantity.ts';
import type { Cents, IsoDate, Order, OrderLine, ProductClass, Scaled, UnitCost, Variant } from './types.ts';

// Line total in cents (§4.1).
export function lineTotal(
  line: Pick<OrderLine, 'kind' | 'quantity' | 'amount' | 'unitPrice' | 'decimals'>,
): Cents {
  return line.kind === 'fixed'
    ? (line.quantity ?? 0) * line.unitPrice
    : roundHalfUp((line.amount * line.unitPrice) / 10 ** line.decimals);
}

// Order total: sum of line totals.
export function orderTotal(lines: Pick<OrderLine, 'lineTotal'>[]): Cents {
  return lines.reduce((sum, l) => sum + l.lineTotal, 0);
}

// Cost snapshot for a sale line: variant cost, else class average (§3.6b), else null.
export function saleUnitCost(variant: Variant, classAvgCost: number | null, decimals: number): UnitCost | null {
  if (variant.cost !== null) return variant.cost;
  if (classAvgCost === null) return null;
  const perItem = variant.kind === 'fixed' ? (classAvgCost * (variant.baseAmount ?? 0)) / 10 ** decimals : classAvgCost;
  return roundCost(perItem);
}

// Build an order line from a variant, snapshotting names, unit, price and cost.
export function buildLine(
  cls: ProductClass,
  variant: Variant,
  input: { quantity?: number; amount?: Scaled; unitPrice?: Cents; classAvgCost: number | null },
  lineId: string,
): OrderLine {
  const fixed = variant.kind === 'fixed';
  const quantity = fixed ? (input.quantity ?? 0) : null;
  const base = {
    lineId,
    classId: cls.id,
    variantId: variant.id,
    className: cls.name,
    variantLabel: variant.label,
    kind: variant.kind,
    unitName: cls.unit.name,
    decimals: cls.unit.decimals,
    quantity,
    amount: fixed ? (quantity ?? 0) * (variant.baseAmount ?? 0) : (input.amount ?? 0),
    unitPrice: input.unitPrice ?? variant.price,
    unitCost: saleUnitCost(variant, input.classAvgCost, cls.unit.decimals),
  };
  return { ...base, lineTotal: lineTotal(base) };
}

// Remove lines with quantity 0 or amount 0.
export function dropEmptyLines(lines: OrderLine[]): OrderLine[] {
  return lines.filter((l) => (l.kind === 'fixed' ? (l.quantity ?? 0) > 0 : l.amount > 0));
}

const isRealDate = (d: string) => {
  const t = new Date(`${d}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(t.getTime()) && t.toISOString().startsWith(d);
};

// Human-readable problems that block saving an order (§9); empty when valid.
export function validateOrder(o: Pick<Order, 'clientId' | 'lines' | 'date'>): string[] {
  const errors: string[] = [];
  if (!o.clientId) errors.push('Choose a client');
  if (o.lines.length === 0) errors.push('Add at least one line');
  for (const l of o.lines) {
    const name = `${l.className} ${l.variantLabel}`;
    if (l.kind === 'fixed') {
      if (!Number.isInteger(l.quantity) || (l.quantity ?? 0) < 1 || (l.quantity ?? 0) > 9999)
        errors.push(`${name}: quantity must be a whole number from 1 to 9,999`);
    } else if (!(l.amount > 0) || l.amount > 1_000_000 * 10 ** l.decimals) {
      errors.push(`${name}: amount must be above 0 and at most 1,000,000 ${l.unitName}`);
    }
    if (!(l.unitPrice >= 0 && l.unitPrice <= 100_000_000)) errors.push(`${name}: price is out of range`);
  }
  if (!isRealDate(o.date)) errors.push('Date must be YYYY-MM-DD');
  return errors;
}

const describeLine = (l: OrderLine) =>
  l.kind === 'fixed'
    ? `${l.quantity}× ${l.className} ${l.variantLabel}`
    : `${formatAmount(l.amount, l.decimals, l.unitName)} ${l.className} ${l.variantLabel}`;

// "2× Cheese 500 g, 1.37 kg Cheese Cut to order".
export function lineSummary(lines: OrderLine[]): string {
  return lines.map(describeLine).join(', ');
}

// "3 items · 1.37 kg": fixed lines count items, variable lines sum per unit.
export function unitSummary(lines: OrderLine[]): string {
  const items = lines.filter((l) => l.kind === 'fixed').reduce((s, l) => s + (l.quantity ?? 0), 0);
  const perUnit = new Map<string, { amount: Scaled; decimals: OrderLine['decimals'] }>();
  for (const l of lines.filter((l) => l.kind === 'variable')) {
    const cur = perUnit.get(l.unitName);
    perUnit.set(l.unitName, { amount: (cur?.amount ?? 0) + l.amount, decimals: l.decimals });
  }
  const parts = items > 0 ? [`${items} ${items === 1 ? 'item' : 'items'}`] : [];
  for (const [name, { amount, decimals }] of perUnit) parts.push(formatAmount(amount, decimals, name));
  return parts.join(' · ');
}

// Same variants with the same quantities or amounts, in any order.
const orderKey = (o: Order) =>
  o.lines.map((l) => `${l.variantId}:${l.kind === 'fixed' ? l.quantity : l.amount}`).sort().join('|');

// The client's last n distinct non-voided orders, newest first (§8.4).
export function startFromPicks(orders: Order[], clientId: string, n = 3): Order[] {
  const mine = orders
    .filter((o) => o.clientId === clientId && !o.voided)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const seen = new Set<string>();
  const picks: Order[] = [];
  for (const o of mine) {
    const key = orderKey(o);
    if (seen.has(key)) continue;
    seen.add(key);
    picks.push(o);
    if (picks.length === n) break;
  }
  return picks;
}

// True when date is after today (both YYYY-MM-DD).
export function isFutureDate(date: IsoDate, today: IsoDate): boolean {
  return date > today;
}
