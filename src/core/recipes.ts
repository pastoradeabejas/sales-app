// Recipes in Transform (spec §3.6a, D-019): a recipe is run a whole number of times.
import type { ClassAmount, LabourRow } from './types.ts';

type Batchable = { inputs: ClassAmount[]; outputs: ClassAmount[]; extras: { label: string; amount: number }[]; labour?: LabourRow[] };

/** The recipe's inputs, outputs, cost extras and labour minutes multiplied by `n` batches. */
export function batch(r: Batchable, n: number): Batchable {
  const times = <T extends { amount: number }>(xs: T[]) => xs.map((x) => ({ ...x, amount: x.amount * n }));
  const out: Batchable = { inputs: times(r.inputs), outputs: times(r.outputs), extras: times(r.extras) };
  if (r.labour) out.labour = r.labour.map((l) => ({ ...l, minutes: l.minutes * n }));
  return out;
}

/** Number of batches from text: a whole number from 1, else null. */
export function parseBatches(text: string): number | null {
  const t = text.trim();
  return /^\d+$/.test(t) && Number(t) >= 1 ? Number(t) : null;
}
