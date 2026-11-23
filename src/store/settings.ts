// Device settings in localStorage (spec §5, §8.1); never synced.
import type { IsoDate, PaymentMethod, Timestamp } from '../core/types.ts';

export interface Settings {
  dataRepo: string;
  branch: string;
  token: string;
  deviceName: string;
  tokenExpiry: IsoDate | null;
  lastBackupAt: Timestamp | null;
  demoMode: boolean;
  lastPaymentMethod: PaymentMethod | null;
}

/** The part of Storage the settings need (localStorage in the app, a fake in tests). */
export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const KEY = 'sales-bookkeeping.settings';

/** Settings of a fresh device. */
export const DEFAULT_SETTINGS: Settings = {
  dataRepo: '',
  branch: 'main',
  token: '',
  deviceName: '',
  tokenExpiry: null,
  lastBackupAt: null,
  demoMode: false,
  lastPaymentMethod: null,
};

// A stored value is kept only if it has the default's type (strings may replace null).
const fits = (def: unknown, v: unknown) => typeof v === typeof def || (def === null && typeof v === 'string');

/** Reads the settings, falling back to defaults for missing or broken values. */
export function loadSettings(storage: KeyValueStorage): Settings {
  let stored: Record<string, unknown> = {};
  try {
    stored = JSON.parse(storage.getItem(KEY) ?? '{}') ?? {};
  } catch {
    // broken JSON: use defaults
  }
  const s: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const [k, def] of Object.entries(DEFAULT_SETTINGS)) if (fits(def, stored[k])) s[k] = stored[k];
  if (!s.branch) s.branch = DEFAULT_SETTINGS.branch;
  return s as unknown as Settings;
}

/** Merges a patch into the stored settings and returns the result. */
export function saveSettings(storage: KeyValueStorage, patch: Partial<Settings>): Settings {
  const s = { ...loadSettings(storage), ...patch };
  storage.setItem(KEY, JSON.stringify(s));
  return s;
}

/** True in demo mode, or when repo, token and device name are set. */
export function isConfigured(s: Settings): boolean {
  return s.demoMode || Boolean(s.dataRepo && s.token && s.deviceName);
}
