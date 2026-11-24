// Materials, transform costs and average cost lookups (spec §3.6b, D-005).
import type { ClassAmount, Cents, CostExtra, CostShare, Order, ProductClass, Purchase, StockEvent, TransformCosts, UnitCost } from './types.ts';
import { classTimeline, perBaseUnit } from './stock.ts';

// Half-up to whole cents; toPrecision strips float noise such as 7.4999999.
const roundCents = (x: number) => Math.round(Number(x.toPrecision(12)));

const decimalsOf = (classesById: Map<string, ProductClass>, id: string) => classesById.get(id)?.unit.decimals ?? 0;

/** Material cost per input (whole cents, null when unknown) and their sum; unknown costs count as 0 and make it incomplete. */
export function materialsCost(
  inputs: ClassAmount[],
  avgCostAt: (classId: string) => UnitCost | null,
  classesById: Map<string, ProductClass>,
): { lines: { classId: string; amount: number; avgCost: UnitCost | null; cost: Cents | null }[]; materials: Cents; complete: boolean } {
  const lines = inputs.map(({ classId, amount }) => {
    const avgCost = avgCostAt(classId);
    const cost = avgCost === null ? null : roundCents((amount / 10 ** decimalsOf(classesById, classId)) * avgCost);
    return { classId, amount, avgCost, cost };
  });
  return {
    lines,
    materials: lines.reduce((s, l) => s + (l.cost ?? 0), 0),
    complete: lines.every((l) => l.cost !== null),
  };
}

/** True when there is at least one share, each in 0..1, summing to 1 within 1e-9. */
export function sharesValid(shares: CostShare[]): boolean {
  const total = shares.reduce((s, x) => s + x.share, 0);
  return shares.length > 0 && shares.every((x) => x.share >= 0 && x.share <= 1) && Math.abs(total - 1) <= 1e-9;
}

/** The costs object stored on a transform; shares default to equal parts. Throws on invalid shares. */
export function buildTransformCosts(input: {
  mode: 'breakdown' | 'total';
  materials: Cents;
  materialsComplete: boolean;
  extras: CostExtra[];
  enteredTotal?: Cents;
  outputs: ClassAmount[];
  shares?: CostShare[];
}): TransformCosts {
  const { mode, materials, materialsComplete, extras, outputs } = input;
  const allocation = input.shares ?? outputs.map((o) => ({ classId: o.classId, share: 1 / outputs.length }));
  if (!sharesValid(allocation)) throw new Error('shares must add up to 100%');
  const total = mode === 'breakdown' ? materials + extras.reduce((s, x) => s + x.amount, 0) : roundCents(input.enteredTotal ?? 0);
  return { mode, materials, materialsComplete, extras, total, allocation };
}

/** "Other" slot of total mode: total − materials (negative means total is less than materials). */
export function otherDifference(costs: TransformCosts): Cents {
  return costs.total - costs.materials;
}

/** Cents per 1 base unit for each output that has a share; an estimate when materials are incomplete. */
export function outputUnitCosts(
  costs: TransformCosts,
  outputs: ClassAmount[],
  classesById: Map<string, ProductClass>,
): { classId: string; unitCost: UnitCost; estimate: boolean }[] {
  return outputs.flatMap(({ classId, amount }) => {
    const share = costs.allocation.find((s) => s.classId === classId)?.share;
    if (share === undefined) return [];
    const unitCost = perBaseUnit(costs.total * share, amount, decimalsOf(classesById, classId));
    return [{ classId, unitCost, estimate: !costs.materialsComplete }];
  });
}

/** Class average cost after its last movement up to `upTo` (inclusive), or at the end; null when unknown. */
export function averageCostAt(
  cls: ProductClass,
  orders: Order[],
  events: StockEvent[],
  classesById: Map<string, ProductClass>,
  upTo?: { date: string; createdAt: string },
  purchases: Purchase[] = [],
): UnitCost | null {
  const t = classTimeline(cls, orders, events, classesById, purchases).filter(
    (m) => !upTo || m.date < upTo.date || (m.date === upTo.date && m.createdAt <= upTo.createdAt),
  );
  return t[t.length - 1]?.avgCostAfter ?? null;
}
