import { describe, it, expect } from 'vitest';
import { newId } from '../../src/core/ids.ts';

describe('newId', () => {
  it('is 16 Crockford base32 chars', () => {
    expect(newId()).toMatch(/^[0-9A-HJKMNP-TV-Z]{16}$/);
  });
  it('sorts by time', () => {
    const a = newId(1_700_000_000_000);
    const b = newId(1_700_000_000_001);
    expect(a < b).toBe(true);
    expect(newId(0).slice(0, 10)).toBe('0000000000');
  });
  it('is unique over 1000 calls', () => {
    const set = new Set(Array.from({ length: 1000 }, () => newId(5)));
    expect(set.size).toBe(1000);
  });
});
