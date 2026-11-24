import { normalizeName } from '../../../core/clients.ts';
import { normalizeGroup } from '../../../core/groups.ts';
import { parseAmount } from '../../../core/quantity.ts';
import { formatMoney, formatUnitCost, parseMoney, parseUnitCost } from '../../../core/money.ts';
import { saleUnitCost } from '../../../core/orders.ts';
import type { Cents, Decimals, UnitCost, Variant, VariantKind } from '../../../core/types.ts';

/** Required, max 60, unique within its group among non-archived classes (D-015). */
export function validateClassName(
  name: string,
  classes: { id: string; name: string; archived: boolean; group?: string }[],
  selfId?: string,
  group = '',
): string | null {
  const t = name.trim();
  if (!t) return 'Name is required';
  if (t.length > 60) return 'Name is too long (max 60)';
  const key = normalizeName(t);
  const g = normalizeGroup(group);
  return classes.some((c) => !c.archived && c.id !== selfId && normalizeGroup(c.group) === g && normalizeName(c.name) === key)
    ? 'A product with this name already exists in this group'
    : null;
}

/** Non-archived classes first, then by name. */
export function sortClasses<T extends { name: string; archived: boolean }>(classes: T[]): T[] {
  return [...classes].sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name));
}

export const sortedVariants = <T extends { sortOrder: number }>(vs: T[]): T[] =>
  [...vs].sort((a, b) => a.sortOrder - b.sortOrder);

/** Moves a variant one place up (-1) or down (1) and renumbers sortOrder 1..n. */
export function moveVariant<T extends { id: string; sortOrder: number }>(vs: T[], id: string, dir: -1 | 1): T[] {
  const list = sortedVariants(vs);
  const i = list.findIndex((v) => v.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return list;
  [list[i], list[j]] = [list[j], list[i]];
  return list.map((v, n) => ({ ...v, sortOrder: n + 1 }));
}

export interface VariantForm {
  label: string;
  kind: VariantKind;
  amountText: string;
  priceText: string;
  costText: string;
}
export interface VariantValue {
  label: string;
  kind: VariantKind;
  baseAmount: number | null;
  price: Cents;
  cost: UnitCost | null;
}
type VariantErrors = Partial<Record<'label' | 'amount' | 'price' | 'cost', string>>;

export function parseVariantForm(
  f: VariantForm,
  decimals: Decimals,
  siblings: { id: string; label: string; archived: boolean }[],
  selfId?: string,
): { errors: VariantErrors; value: VariantValue | null } {
  const errors: VariantErrors = {};
  const label = f.label.trim();
  if (!label) errors.label = 'Label is required';
  else if (label.length > 60) errors.label = 'Label is too long (max 60)';
  else if (siblings.some((v) => !v.archived && v.id !== selfId && normalizeName(v.label) === normalizeName(label)))
    errors.label = 'A variant with this label already exists';
  const baseAmount = f.kind === 'fixed' ? parseAmount(f.amountText, decimals) : null;
  if (f.kind === 'fixed' && baseAmount === null) errors.amount = 'Enter an amount greater than 0';
  const price = parseMoney(f.priceText);
  if (price === null) errors.price = 'Enter a price (0 to 1,000,000)';
  const costBlank = f.costText.trim() === '';
  const cost = costBlank ? null : parseUnitCost(f.costText);
  if (!costBlank && cost === null) errors.cost = 'Enter a valid cost or leave empty';
  if (Object.keys(errors).length) return { errors, value: null };
  return { errors, value: { label, kind: f.kind, baseAmount, price: price as Cents, cost } };
}

/** Key for a new custom field from its label, unique among existing keys. */
export function fieldKey(label: string, existing: string[]): string {
  const base = normalizeName(label).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'field';
  let key = base;
  for (let n = 2; existing.includes(key); n++) key = `${base}_${n}`;
  return key;
}

/** Price as shown in tables: per item for fixed, per base unit for variable. */
export const priceLabel = (v: { kind: VariantKind; price: Cents }, unitName: string): string =>
  formatMoney(v.price) + (v.kind === 'variable' ? `/${unitName}` : '');

/** Cost shown in the table: a variant's sale cost (§3.6b), or the class average per unit when `v` is null. */
export function costLabel(
  v: Pick<Variant, 'kind' | 'cost' | 'baseAmount'> | null,
  avg: UnitCost | null,
  decimals: Decimals,
  unitName: string,
): string {
  const cost = v ? saleUnitCost(v, avg, decimals) : avg;
  return cost === null ? '—' : formatUnitCost(cost) + (!v || v.kind === 'variable' ? `/${unitName}` : '');
}
