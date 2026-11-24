import { parseMoney } from '../../../core/money.ts';
import type { Cents, Id, LabourRow } from '../../../core/types.ts';

const MAX_RATE: Cents = 100_000;

/** Error text for a level name: required, unique among non-archived levels (case-insensitive); '' when fine. */
export function levelNameError(name: string, levels: { id: Id; name: string; archived: boolean }[], selfId: Id | null): string {
  const n = name.trim().toLowerCase();
  if (!n) return 'Give the level a name.';
  return levels.some((l) => !l.archived && l.id !== selfId && l.name.trim().toLowerCase() === n) ? 'A level with this name already exists.' : '';
}

/** Euros per hour to cents (0 to €1,000), or null. */
export function parseRate(text: string): Cents | null {
  const c = parseMoney(text);
  return c === null || c < 0 || c > MAX_RATE ? null : c;
}

export const rateText = (cents: Cents) => (cents / 100).toFixed(2).replace('.', ',');

/** Whole minutes above 0, or null. */
export function parseMinutes(text: string): number | null {
  const t = text.trim();
  return /^\d+$/.test(t) && Number(t) > 0 ? Number(t) : null;
}

/** Labour rows from the form (blank minutes are skipped), or an error: bad minutes, no level, a level twice. */
export function labourRows(rows: { levelId: Id; text: string }[]): { rows: LabourRow[]; error: string } {
  const out: LabourRow[] = [];
  for (const r of rows) {
    if (!r.text.trim()) continue;
    const minutes = parseMinutes(r.text);
    if (minutes === null) return { rows: [], error: 'Minutes must be a whole number above 0.' };
    if (!r.levelId) return { rows: [], error: 'Choose a level on every labour row.' };
    if (out.some((x) => x.levelId === r.levelId)) return { rows: [], error: 'Use each level once.' };
    out.push({ levelId: r.levelId, minutes });
  }
  return { rows: out, error: '' };
}
