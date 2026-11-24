// Pure helpers of the Stock screens (§8.9–8.12): previews, reasons, transform rows, shares, costs, texts, chart.
import { buildTransformCosts, sharesValid } from '../../../core/costs.ts';
import { formatUnitCost, parseMoney } from '../../../core/money.ts';
import { fullName } from '../../../core/groups.ts';
import { formatAmount } from '../../../core/quantity.ts';
import { daysLeft, type Movement } from '../../../core/stock.ts';
import type { ClassAmount, CostShare, Decimals, Id, Order, ProductClass, Scaled, StockEvent, TransformCosts } from '../../../core/types.ts';

/** Stock before and after an add or remove; an add on negative stock starts from 0 (§4.3). */
export function movePreview(stock: Scaled, type: 'add' | 'remove', amount: Scaled | null) {
  const a = amount ?? 0;
  const reset = type === 'add' && a > 0 && stock < 0;
  const after = type === 'add' ? (reset ? 0 : stock) + a : stock - a;
  return { before: stock, after, reset };
}

export const REASONS = [
  { value: 'waste', label: 'Waste' },
  { value: 'gift', label: 'Gift' },
  { value: 'own use', label: 'Own use' },
  { value: 'count correction', label: 'Count correction' },
  { value: 'other', label: 'Other' },
] as const;

/** Stored reason of a remove: the chip value, or the trimmed free text for Other. */
export function reasonValue(chip: string, other: string): string {
  return chip === 'other' ? other.trim() : chip;
}

/** Display label of a stored reason; free text is kept as typed. */
export function reasonLabel(reason: string): string {
  return REASONS.find((r) => r.value === reason && r.value !== 'other')?.label ?? reason;
}

/** Amount as input text (no thousands separators, so parseAmount reads it back). */
export function toInputText(scaled: Scaled, decimals: Decimals): string {
  return formatAmount(scaled, decimals).replaceAll(',', '');
}

/** A transform form row; `base` is the recipe amount while the row is still linked to scaling. */
const pctText = (hundredths: number) => String(hundredths / 100);

/** Equal shares in percent text, 2 decimals, the last one taking the remainder. */
export function equalPercents(n: number): string[] {
  const each = Math.floor(10000 / n);
  return Array.from({ length: n }, (_, i) => pctText(i === n - 1 ? 10000 - each * (n - 1) : each));
}

/** Percent texts (decimal comma accepted) to fractions, or null when one is invalid or above 100. */
export function percentsToShares(classIds: Id[], texts: string[]): CostShare[] | null {
  const shares: CostShare[] = [];
  for (let i = 0; i < classIds.length; i++) {
    const s = (texts[i] ?? '').trim().replace(',', '.');
    if (!/^\d+(\.\d+)?$/.test(s) || Number(s) > 100) return null;
    shares.push({ classId: classIds[i], share: Number((Number(s) / 100).toFixed(6)) });
  }
  return shares;
}

export function sharesToPercents(shares: CostShare[]): string[] {
  return shares.map((s) => pctText(Math.round(s.share * 10000)));
}

const amountOf = (c: ProductClass | undefined, amount: Scaled, sign = '') =>
  `${sign}${formatAmount(amount, c?.unit.decimals ?? 0, c?.unit.name ?? '')}`;
const nameOf = (classesById: Map<Id, ProductClass>, id: Id) => {
  const c = classesById.get(id);
  return c ? fullName(c) : 'Unknown';
};

/** "Milk −500 kg → Yogurt +10,000 pcs". */
export function transformSummary(inputs: ClassAmount[], outputs: ClassAmount[], classesById: Map<Id, ProductClass>): string {
  const side = (xs: ClassAmount[], sign: string) =>
    xs.map((x) => `${nameOf(classesById, x.classId)} ${amountOf(classesById.get(x.classId), x.amount, sign)}`).join(', ');
  return `${side(inputs, '−')} → ${side(outputs, '+')}`;
}

export interface CostForm {
  opened: boolean;
  mode: 'breakdown' | 'total';
  extras: { label: string; text: string }[];
  totalText: string;
  shareTexts: string[];
}

/** The costs to store from the Costs section, null when it was left empty, or an error. */
export function costsFromForm(
  form: CostForm,
  mat: { materials: number; complete: boolean },
  outputs: ClassAmount[],
): { costs: TransformCosts | null; error: string } {
  if (!form.opened) return { costs: null, error: '' };
  const extras = [];
  if (form.mode === 'breakdown') {
    for (const x of form.extras) {
      if (x.text.trim() === '') continue;
      const amount = parseMoney(x.text);
      if (amount === null) return { costs: null, error: 'Check the extra cost amounts.' };
      extras.push({ label: x.label.trim() || 'Other', amount });
    }
    if (!extras.length && mat.materials === 0 && !mat.complete) return { costs: null, error: '' };
  }
  let enteredTotal: number | undefined;
  if (form.mode === 'total') {
    if (form.totalText.trim() === '') return { costs: null, error: '' };
    const t = parseMoney(form.totalText);
    if (t === null) return { costs: null, error: 'Enter the total cost in euros.' };
    enteredTotal = t;
  }
  let shares: CostShare[] = [{ classId: outputs[0]?.classId ?? '', share: 1 }];
  if (outputs.length > 1) {
    const s = percentsToShares(outputs.map((o) => o.classId), form.shareTexts);
    if (!s || !sharesValid(s)) return { costs: null, error: 'Shares must add up to 100%.' };
    shares = s;
  }
  const costs = buildTransformCosts({ mode: form.mode, materials: mat.materials, materialsComplete: mat.complete, extras, enteredTotal, outputs, shares });
  return { costs, error: '' };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayNumber = (date: string) => Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) / 86_400_000;
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "today", "yesterday", "3 Nov", or "31 Dec 2025" in another year. */
export function dayLabel(date: string, today: string): string {
  const diff = dayNumber(today) - dayNumber(date);
  if (diff === 0) return 'today';
  if (diff === 1) return 'yesterday';
  const d = `${+date.slice(8, 10)} ${MONTHS[+date.slice(5, 7) - 1]}`;
  return date.slice(0, 4) === today.slice(0, 4) ? d : `${d} ${date.slice(0, 4)}`;
}

/** History label (§8.12): Add / Remove (reason) / Transform in (from Milk) / Transform out (to Yogurt) / Sale (client). */
export function movementLabel(m: Movement, classesById: Map<Id, ProductClass>): string {
  const others = (m.otherClassIds ?? []).map((id) => nameOf(classesById, id)).join(' + ');
  switch (m.kind) {
    case 'add':
      return 'Add';
    case 'remove':
      return m.reason ? `Remove (${m.reason})` : 'Remove';
    case 'transform-in':
      return `Transform in (from ${others})`;
    case 'transform-out':
      return `Transform out (to ${others})`;
    case 'sale':
      return `Sale (${m.clientName ?? ''})`;
    case 'purchase':
      return m.supplierName ? `Purchase (from ${m.supplierName})` : 'Purchase';
  }
}

/** Signed amount of a movement: "+2,000 kg", "−500 kg". */
export function signedAmount(delta: Scaled, cls: ProductClass): string {
  return `${delta >= 0 ? '+' : ''}${formatAmount(delta, cls.unit.decimals, cls.unit.name)}`;
}

/** Days left for sellable classes (§4.3): "≈ 23 days", "not enough data", or '' for raw materials. */
export function daysLeftText(cls: ProductClass, stock: Scaled, rate: { perDay: number; enoughData: boolean }): string {
  if (!cls.sellable) return '';
  if (!rate.enoughData) return 'not enough data';
  return `≈ ${daysLeft(stock, rate.perDay) ?? 0} days`;
}

/** Sell rate per week, at most one decimal: "≈ 2.1 kg / week". */
export function rateText(perDay: number, cls: ProductClass): string {
  const d = Math.min(cls.unit.decimals, 1) as Decimals;
  const perWeek = Math.round((perDay * 7 * 10 ** d) / 10 ** cls.unit.decimals);
  return `≈ ${formatAmount(perWeek, d, cls.unit.name)} / week`;
}

export interface RecentItem {
  key: string;
  kind: 'add' | 'remove' | 'transform' | 'sale';
  title: string;
  sub: string;
  deltas: string[];
  href: string;
}

/** The last movements across all tracked classes, newest first (§8.9). */
export function recentMovements(
  orders: Order[],
  events: StockEvent[],
  recipes: { id: Id; name: string }[],
  classesById: Map<Id, ProductClass>,
  today: string,
  limit = 10,
): RecentItem[] {
  const tracked = (id: Id) => classesById.get(id)?.trackStock === true;
  const named = (x: ClassAmount, sign: string) => `${nameOf(classesById, x.classId)} ${amountOf(classesById.get(x.classId), x.amount, sign)}`;
  const all: (RecentItem & { date: string; createdAt: string })[] = [];
  for (const o of orders) {
    if (o.voided) continue;
    const sums = new Map<Id, number>();
    for (const l of o.lines) if (tracked(l.classId)) sums.set(l.classId, (sums.get(l.classId) ?? 0) + l.amount);
    if (!sums.size) continue;
    all.push({
      key: o.id, kind: 'sale', date: o.date, createdAt: o.createdAt, title: `Sale · ${o.clientName}`,
      sub: cap(dayLabel(o.date, today)), deltas: [...sums].map(([classId, amount]) => named({ classId, amount }, '−')), href: `#/orders/${o.id}`,
    });
  }
  for (const e of events) {
    if (e.voided) continue;
    const day = cap(dayLabel(e.date, today));
    if (e.type === 'transform') {
      const recipe = recipes.find((r) => r.id === e.recipeId)?.name;
      all.push({
        key: e.id, kind: 'transform', date: e.date, createdAt: e.createdAt, title: recipe ? `Transform · ${recipe}` : 'Transform',
        sub: day, deltas: [...e.inputs.map((x) => named(x, '−')), ...e.outputs.map((x) => named(x, '+'))], href: `#/stock/${e.inputs[0]?.classId ?? ''}`,
      });
      continue;
    }
    const c = classesById.get(e.classId);
    if (!c?.trackStock) continue;
    const add = e.type === 'add';
    const cost = add && e.unitCost !== null ? ` · ${formatUnitCost(e.unitCost)} / ${c.unit.name}` : '';
    all.push({
      key: e.id, kind: e.type, date: e.date, createdAt: e.createdAt,
      title: add ? `Add · ${fullName(c)}` : `Remove · ${reasonLabel(e.reason) || 'Other'}`,
      sub: add ? `${day}${cost}` : `${day} · ${fullName(c)}`, deltas: [amountOf(c, e.amount, add ? '+' : '−')], href: `#/stock/${c.id}`,
    });
  }
  all.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  return all.slice(0, limit).map(({ date: _d, createdAt: _c, ...r }) => r);
}

export interface ChartModel {
  points: [number, number][];
  markers: { x: number; y: number; kind: 'add' | 'transform' }[];
  min: Scaled;
  max: Scaled;
  /** Balance at the end of each day with movements. */
  days: { date: string; balance: Scaled }[];
  first: string;
  last: string;
  /** Y of a value, for grid lines. */
  y: (v: Scaled) => number;
}

/** Step line of the end-of-day balance from 0, up to today, with add and transform markers; null without movements. */
export function chartModel(timeline: Movement[], today: string, w = 340, h = 120, pad = 10): ChartModel | null {
  if (!timeline.length) return null;
  const days: { date: string; balance: Scaled }[] = [];
  const kinds = new Map<string, Set<'add' | 'transform'>>();
  for (const m of timeline) {
    if (days[days.length - 1]?.date === m.date) days[days.length - 1].balance = m.balanceAfter;
    else days.push({ date: m.date, balance: m.balanceAfter });
    const k = m.kind === 'add' ? 'add' : m.kind.startsWith('transform') ? 'transform' : null;
    if (k) kinds.set(m.date, (kinds.get(m.date) ?? new Set()).add(k));
  }
  const first = days[0].date;
  const last = today > days[days.length - 1].date ? today : days[days.length - 1].date;
  const span = dayNumber(last) - dayNumber(first);
  const min = Math.min(0, ...days.map((d) => d.balance));
  let max = Math.max(0, ...days.map((d) => d.balance));
  if (max === min) max = min + 1;
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const x = (date: string) => (span ? r1(((dayNumber(date) - dayNumber(first)) / span) * w) : 0);
  const y = (v: Scaled) => r1(h - pad - ((v - min) / (max - min)) * (h - 2 * pad));
  const points: [number, number][] = [[x(days[0].date), y(days[0].balance)]];
  for (const d of days.slice(1)) {
    const px = x(d.date);
    points.push([px, points[points.length - 1][1]], [px, y(d.balance)]);
  }
  points.push([w, points[points.length - 1][1]]);
  // Drop the repeated first corner (both at x = 0 with the start height).
  const dedup = points.filter((p, i) => i === 0 || p[0] !== points[i - 1][0] || p[1] !== points[i - 1][1]);
  const markers = days.flatMap((d) => [...(kinds.get(d.date) ?? [])].map((kind) => ({ x: x(d.date), y: y(d.balance), kind })));
  return { points: dedup, markers, min, max, days, first, last, y };
}

/** Stepper step: one base unit (1 kg, 1 L, 1 pc) in scaled units. */
export const amountStep = (decimals: Decimals): Scaled => 10 ** decimals;

/** One step up or down from the current amount (null counts as 0), never below 0. */
export function stepAmount(scaled: Scaled | null, decimals: Decimals, dir: 1 | -1): Scaled {
  return Math.max(0, (scaled ?? 0) + dir * amountStep(decimals));
}

/** Recipes that can be used (not archived), by name. */
export function activeRecipes<T extends { name: string; archived: boolean }>(recipes: T[]): T[] {
  return recipes.filter((r) => !r.archived).sort((a, b) => a.name.localeCompare(b.name));
}

/** Error text for a recipe name: required, unique among non-archived recipes (case-insensitive); '' when fine. */
export function recipeNameError(name: string, recipes: { id: Id; name: string; archived: boolean }[], selfId: Id | null): string {
  const n = name.trim().toLowerCase();
  if (!n) return 'Give the recipe a name.';
  return recipes.some((r) => !r.archived && r.id !== selfId && r.name.trim().toLowerCase() === n) ? 'A recipe with this name already exists.' : '';
}
