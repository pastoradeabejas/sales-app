import { describe, expect, it } from 'vitest';
import { requestPersistence } from '../../src/store/persist.ts';

describe('requestPersistence', () => {
  it('is false when the API is missing', async () => {
    expect(await requestPersistence({})).toBe(false);
  });

  it('returns true when already persisted, without asking again', async () => {
    let asked = false;
    const persist = async () => {
      asked = true;
      return true;
    };
    expect(await requestPersistence({ storage: { persisted: async () => true, persist } })).toBe(true);
    expect(asked).toBe(false);
  });

  it('asks and returns the answer; errors give false', async () => {
    expect(await requestPersistence({ storage: { persisted: async () => false, persist: async () => true } })).toBe(true);
    expect(await requestPersistence({ storage: { persist: () => Promise.reject(new Error('x')) } })).toBe(false);
  });
});
