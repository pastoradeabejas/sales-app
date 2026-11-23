// Text size preference (Settings › Appearance): a scale applied to the whole UI. Pure.

export const TEXT_SCALE = { min: 0.85, max: 1.4, step: 0.05 } as const;
export const textScaleStorageKey = 'textScale';

/** Stored value → scale within the range, on the step; 1 when missing or invalid. */
export function parseTextScale(stored: string | null | undefined): number {
  const n = Number(stored);
  if (!stored || !Number.isFinite(n)) return 1;
  const clamped = Math.min(TEXT_SCALE.max, Math.max(TEXT_SCALE.min, n));
  return Math.round(Math.round(clamped / TEXT_SCALE.step) * TEXT_SCALE.step * 100) / 100;
}
