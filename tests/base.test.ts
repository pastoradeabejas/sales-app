import { describe, expect, it } from 'vitest';
import { normalizeBase } from '../src/manifest.ts';

describe('normalizeBase', () => {
  it('defaults to / when unset or blank', () => {
    expect(normalizeBase(undefined)).toBe('/');
    expect(normalizeBase('')).toBe('/');
    expect(normalizeBase('  ')).toBe('/');
    expect(normalizeBase('/')).toBe('/');
  });

  it('adds missing leading and trailing slashes', () => {
    expect(normalizeBase('sales-app')).toBe('/sales-app/');
    expect(normalizeBase('/sales-app')).toBe('/sales-app/');
    expect(normalizeBase('sales-app/')).toBe('/sales-app/');
    expect(normalizeBase('/sales-app/')).toBe('/sales-app/');
  });

  it('collapses repeated slashes', () => {
    expect(normalizeBase('//sales-app//')).toBe('/sales-app/');
  });
});
