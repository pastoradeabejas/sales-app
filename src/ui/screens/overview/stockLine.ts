// Secondary line of a stock row on the Overview.
import { formatAmount } from '../../../core/quantity.ts';
import type { Movement } from '../../../core/stock.ts';
import type { ProductClass } from '../../../core/types.ts';

const KIND: Record<Movement['kind'], string> = {
  add: 'added',
  remove: 'removed',
  sale: 'sale',
  'transform-in': 'transform',
  'transform-out': 'transform',
};

export function stockLine(cls: ProductClass, daysLeft: number | null, last: Movement | null): string {
  const parts: string[] = [];
  if (!cls.sellable) {
    parts.push(
      last
        ? `Raw material · last: ${last.delta < 0 ? '−' : '+'}${formatAmount(Math.abs(last.delta), cls.unit.decimals, cls.unit.name)} ${KIND[last.kind]}`
        : 'Raw material',
    );
  } else {
    parts.push(daysLeft !== null ? `≈ ${daysLeft} days left` : 'not enough data');
  }
  if (cls.lowStockThreshold !== null) {
    parts.push(`low below ${formatAmount(cls.lowStockThreshold, cls.unit.decimals, cls.unit.name)}`);
  }
  return parts.join(' · ');
}
