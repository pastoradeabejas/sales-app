// Small pure helpers for the polish pass: header date button, quick amount chips, stepping.
import type { Cents, IsoDate } from '../../../core/types.ts';
import { dayLabel, formatDay } from './logic.ts';
import { formatMoney } from '../../../core/money.ts';

/** "Today, 24 Nov", "Yesterday, 23 Nov", otherwise "Mon 17 Nov" (year added when not the current one). */
export function dateButtonLabel(date: IsoDate, today: IsoDate): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Choose date';
  const full = formatDay(date, true); // "Mon 17 Nov 2026"
  const short = date.slice(0, 4) === today.slice(0, 4) ? full.replace(/ \d{4}$/, '') : full;
  const label = dayLabel(date, today);
  return label === 'Today' || label === 'Yesterday' ? `${label}, ${short.replace(/^\w{3} /, '')}` : short;
}

export interface QuickChip {
  label: string;
  cents: Cents;
}

/** "Owed €X" (when owed > 0), then €10, €20, €50. */
export function quickChips(owed: Cents): QuickChip[] {
  const fixed = [1000, 2000, 5000].map((cents) => ({ label: formatMoney(cents), cents }));
  return owed > 0 ? [{ label: `Owed ${formatMoney(owed)}`, cents: owed }, ...fixed] : fixed;
}

/** Steps the amount text by whole euros, never below €0.01. */
export function stepAmount(current: Cents | null, deltaCents: Cents): Cents {
  return Math.max(1, (current ?? 0) + deltaCents);
}
