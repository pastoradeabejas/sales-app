import { describe, expect, it } from 'vitest';
import { isConfigured, loadSettings, saveSettings, type KeyValueStorage } from '../../src/store/settings.ts';

function fakeStorage(): KeyValueStorage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

describe('settings', () => {
  it('has defaults when nothing is stored', () => {
    expect(loadSettings(fakeStorage())).toEqual({
      dataRepo: '',
      branch: 'main',
      token: '',
      deviceName: '',
      tokenExpiry: null,
      lastBackupAt: null,
      demoMode: false,
      lastPaymentMethod: null,
    });
  });

  it('round-trips a patch and keeps the other fields', () => {
    const s = fakeStorage();
    saveSettings(s, { dataRepo: 'owner/sales-data', token: 't', deviceName: 'Phone A' });
    const saved = saveSettings(s, { lastPaymentMethod: 'bizum' });
    expect(saved.dataRepo).toBe('owner/sales-data');
    expect(loadSettings(s)).toEqual(saved);
    expect(loadSettings(s)).toMatchObject({ token: 't', deviceName: 'Phone A', branch: 'main', lastPaymentMethod: 'bizum' });
  });

  it('falls back to defaults for broken or wrongly typed data', () => {
    const s = fakeStorage();
    s.setItem('sales-bookkeeping.settings', '{not json');
    expect(loadSettings(s).branch).toBe('main');
    s.setItem('sales-bookkeeping.settings', JSON.stringify({ demoMode: 'yes', branch: 5, token: 'abc' }));
    expect(loadSettings(s)).toMatchObject({ demoMode: false, branch: 'main', token: 'abc' });
  });

  it('is configured in demo mode or with repo, token and device name', () => {
    const base = loadSettings(fakeStorage());
    expect(isConfigured(base)).toBe(false);
    expect(isConfigured({ ...base, demoMode: true })).toBe(true);
    expect(isConfigured({ ...base, dataRepo: 'o/r', token: 't' })).toBe(false);
    expect(isConfigured({ ...base, dataRepo: 'o/r', token: 't', deviceName: 'Mac' })).toBe(true);
  });
});
