// Stock timeline, balance, average cost and sell rate (spec §3.6, §3.6b, §4.3).
import type { Cents, Decimals, Order, ProductClass, Scaled, StockEvent, StockTransform, UnitCost } from './types.ts';

/** transform-in = stock enters this class (it is an output); transform-out = it is consumed (an input), as labelled in §8.12. */
export type MovementKind = 'add' | 'remove' | 'sale' | 'transform-in' | 'transform-out';

export interface Movement {
  date: string;
  createdAt: string;
  kind: MovementKind;
  /** Scaled, positive. */
  amount: Scaled;
  /** Signed amount of this movement (the reset is not included). */
  delta: Scaled;
  balanceBefore: Scaled;
  balanceAfter: Scaled;
  /** A negative balance was reset to 0 before this movement. */
  reset: boolean;
  avgCostAfter: UnitCost | null;
  ref: { type: 'order' | 'stock'; id: string };
  reason?: string;
  otherClassIds?: string[];
  clientName?: string;
}

export interface StockState {
  stock: Scaled;
  avgCost: UnitCost | null;
  last: Movement | null;
}

/** A timeline entry before the balance is run; `cost` is the incoming unit cost (null = at current average). */
type Entry = Omit<Movement, 'delta' | 'balanceBefore' | 'balanceAfter' | 'reset' | 'avgCostAfter'> & { id: string; cost: UnitCost | null };

// Half-up to 4 decimals; toPrecision strips float noise such as 22.4999999.
const round4 = (x: number) => Math.round(Number((x * 1e4).toPrecision(12))) / 1e4;

/** Cents spread over a scaled amount: cents per 1 base unit, 4 decimals (D-005). */
export function perBaseUnit(cents: Cents, amount: Scaled, decimals: Decimals): UnitCost {
  return round4((cents * 10 ** decimals) / amount);
}

const sum = (xs: { amount: number }[]) => xs.reduce((s, x) => s + x.amount, 0);

// Pushes one entry per class touched by the order or event, for classes that `want` returns.
function collect(orders: Order[], events: StockEvent[], want: (id: string) => ProductClass | undefined): Map<string, Entry[]> {
  const out = new Map<string, Entry[]>();
  const push = (classId: string, e: Entry) => {
    if (!want(classId)) return;
    if (!out.has(classId)) out.set(classId, []);
    out.get(classId)!.push(e);
  };
  const base = (r: { id: string; date: string; createdAt: string }, type: 'order' | 'stock') =>
    ({ id: r.id, date: r.date, createdAt: r.createdAt, ref: { type, id: r.id } });

  for (const o of orders) {
    if (o.voided) continue;
    for (const classId of new Set(o.lines.map((l) => l.classId))) {
      const amount = sum(o.lines.filter((l) => l.classId === classId));
      push(classId, { ...base(o, 'order'), kind: 'sale', amount, cost: null, clientName: o.clientName });
    }
  }
  for (const ev of events) {
    if (ev.voided) continue;
    if (ev.type !== 'transform') {
      push(ev.classId, { ...base(ev, 'stock'), kind: ev.type, amount: ev.amount, cost: ev.type === 'add' ? ev.unitCost : null, reason: ev.reason });
      continue;
    }
    const ins = [...new Set(ev.inputs.map((x) => x.classId))];
    const outs = [...new Set(ev.outputs.map((x) => x.classId))];
    for (const id of ins) {
      push(id, { ...base(ev, 'stock'), kind: 'transform-out', amount: sum(ev.inputs.filter((x) => x.classId === id)), cost: null, otherClassIds: outs });
    }
    for (const id of outs) {
      if (!want(id)) continue;
      const amount = sum(ev.outputs.filter((x) => x.classId === id));
      push(id, { ...base(ev, 'stock'), kind: 'transform-in', amount, cost: outputCost(ev, id, amount, want(id)!), otherClassIds: ins });
    }
  }
  return out;
}

// Unit cost of one transform output, or null when the transform has no costs or no share for it.
function outputCost(t: StockTransform, classId: string, amount: Scaled, cls: ProductClass): UnitCost | null {
  const share = t.costs?.allocation.find((s) => s.classId === classId)?.share;
  return t.costs && share !== undefined ? perBaseUnit(t.costs.total * share, amount, cls.unit.decimals) : null;
}

// Sorts entries by date, createdAt, id and runs the balance with the reset rule and moving average.
function run(entries: Entry[]): Movement[] {
  const sorted = [...entries].sort((a, b) =>
    a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  let balance = 0;
  let avg: UnitCost | null = null;
  return sorted.map(({ id: _id, cost, ...e }) => {
    const before = balance;
    const incoming = e.kind === 'add' || e.kind === 'transform-in';
    const reset = incoming && balance < 0;
    if (reset) balance = 0;
    if (incoming && cost !== null) avg = round4(avg === null ? cost : (balance * avg + e.amount * cost) / (balance + e.amount));
    const delta = incoming ? e.amount : -e.amount;
    balance += delta;
    return { ...e, delta, balanceBefore: before, balanceAfter: balance, reset, avgCostAfter: avg };
  });
}

/** One class's stock timeline, oldest first (§4.3); [] when the class does not track stock. */
export function classTimeline(cls: ProductClass, orders: Order[], events: StockEvent[], _classesById: Map<string, ProductClass>): Movement[] {
  if (!cls.trackStock) return [];
  return run(collect(orders, events, (id) => (id === cls.id ? cls : undefined)).get(cls.id) ?? []);
}

/** Current stock, average cost and last movement of every tracked class, in one pass over the records. */
export function stockSnapshot(classes: ProductClass[], orders: Order[], events: StockEvent[]): Map<string, StockState> {
  const tracked = new Map(classes.filter((c) => c.trackStock).map((c) => [c.id, c]));
  const entries = collect(orders, events, (id) => tracked.get(id));
  const snap = new Map<string, StockState>();
  for (const id of tracked.keys()) {
    const t = run(entries.get(id) ?? []);
    const last = t[t.length - 1] ?? null;
    snap.set(id, { stock: last?.balanceAfter ?? 0, avgCost: last?.avgCostAfter ?? null, last });
  }
  return snap;
}

const dayNumber = (date: string) => Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) / 86_400_000;

/** Scaled units sold per day over the last 30 days incl. today; enough data needs sales on ≥ 7 distinct days. */
export function sellRate(classId: string, orders: Order[], today: string): { perDay: number; enoughData: boolean } {
  const end = dayNumber(today);
  let sold = 0;
  const days = new Set<string>();
  for (const o of orders) {
    const d = dayNumber(o.date);
    if (o.voided || d > end || d <= end - 30) continue;
    const amount = sum(o.lines.filter((l) => l.classId === classId));
    if (amount > 0) {
      sold += amount;
      days.add(o.date);
    }
  }
  return { perDay: sold / 30, enoughData: days.size >= 7 };
}

/** Whole days of stock left at this rate, or null without a rate or stock. */
export function daysLeft(stock: Scaled, perDay: number): number | null {
  return perDay > 0 && stock > 0 ? Math.floor(stock / perDay) : null;
}

/** True when the class has a threshold and stock is at or below it. */
export function isLowStock(cls: ProductClass, stock: Scaled): boolean {
  return cls.lowStockThreshold !== null && stock <= cls.lowStockThreshold;
}

/** Tracked classes that a consumption (negative delta) would take below 0. */
export function stockWarnings(delta: Map<string, Scaled>, snapshot: Map<string, StockState>): { classId: string; after: Scaled }[] {
  const out: { classId: string; after: Scaled }[] = [];
  for (const [classId, d] of delta) {
    const s = snapshot.get(classId);
    if (s && d < 0 && s.stock + d < 0) out.push({ classId, after: s.stock + d });
  }
  return out;
}

/** Rule violations of a transform (§3.6); [] when valid. */
export function validateTransform(t: Pick<StockTransform, 'inputs' | 'outputs'>, classesById: Map<string, ProductClass>): string[] {
  const errors: string[] = [];
  for (const [name, rows] of [['inputs', t.inputs], ['outputs', t.outputs]] as const) {
    if (rows.length < 1 || rows.length > 5) errors.push(`${name}: 1 to 5 required`);
  }
  const rows = [...t.inputs, ...t.outputs];
  if (rows.some((r) => !(r.amount > 0))) errors.push('amounts must be > 0');
  if (t.inputs.some((i) => t.outputs.some((o) => o.classId === i.classId))) errors.push('a class cannot be both input and output');
  if (rows.some((r) => !classesById.get(r.classId)?.trackStock)) errors.push('only classes with stock tracking');
  return errors;
}
