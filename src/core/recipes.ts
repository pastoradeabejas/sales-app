// Recipe scaling and yield (spec §3.6a).
import type { ClassAmount, Decimals } from './types.ts';

// Half-up to an integer; toPrecision strips float noise such as 1.4999999.
const roundInt = (x: number) => Math.round(Number(x.toPrecision(12)));

/**
 * Scaled amounts for rows (inputs then outputs) after one row changed: each other row is
 * base × factor, rounded half-up to its scaled integer (amounts are already in class decimals).
 */
export function scaleRows(
  rows: { classId: string; amount: number }[],
  base: { classId: string; amount: number }[],
  changed: { index: number; amount: number },
  _decimalsOf: (classId: string) => Decimals,
): number[] {
  const from = base[changed.index].amount;
  return rows.map((_, i) => (i === changed.index ? changed.amount : roundInt((base[i].amount * changed.amount) / from)));
}

/** Output base units per 1 input base unit (500 kg milk → 10,000 pcs gives 20). */
export function recipeYield(input: ClassAmount, output: ClassAmount, decimalsOf: (classId: string) => Decimals): number {
  return output.amount / 10 ** decimalsOf(output.classId) / (input.amount / 10 ** decimalsOf(input.classId));
}
