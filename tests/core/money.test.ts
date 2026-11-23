import { describe, it, expect } from 'vitest';
import { roundHalfUp, roundCost, formatMoney, formatUnitCost, parseMoney, parseUnitCost } from '../../src/core/money.ts';

describe('rounding', () => {
  it('rounds half away from zero', () => {
    expect(roundHalfUp(2.5)).toBe(3);
    expect(roundHalfUp(-2.5)).toBe(-3);
    expect(roundHalfUp(2.4)).toBe(2);
  });
  it('is robust to float noise', () => {
    expect(roundHalfUp(3561.9999999999995)).toBe(3562);
    expect(roundHalfUp(1.005 * 100)).toBe(101); // 100.49999999999999 in floats
  });
  it('roundCost keeps 4 decimals', () => {
    expect(roundCost(2.66666)).toBe(2.6667);
    expect(roundCost(750)).toBe(750);
    expect(roundCost(0.00005)).toBe(0.0001);
  });
});

describe('formatMoney', () => {
  it('formats', () => {
    expect(formatMoney(123450)).toBe('€1,234.50');
    expect(formatMoney(0)).toBe('€0.00');
    expect(formatMoney(-500)).toBe('−€5.00');
    expect(formatMoney(5)).toBe('€0.05');
  });
});

describe('formatUnitCost', () => {
  it('trims beyond 2 decimals', () => {
    expect(formatUnitCost(2.7)).toBe('€0.027');
    expect(formatUnitCost(750)).toBe('€7.50');
    expect(formatUnitCost(2.6667)).toBe('€0.026667');
    expect(formatUnitCost(0.5)).toBe('€0.005');
  });
});

describe('parseMoney', () => {
  it('accepts', () => {
    expect(parseMoney('14')).toBe(1400);
    expect(parseMoney('14.5')).toBe(1450);
    expect(parseMoney('14,50')).toBe(1450);
    expect(parseMoney('€ 14,50')).toBe(1450);
    expect(parseMoney('0')).toBe(0);
    expect(parseMoney('1000000')).toBe(100000000);
  });
  it('rejects', () => {
    for (const t of ['', ' ', 'abc', '-3', '1.234', '1000000.01', '1,2,3', '1..2'])
      expect(parseMoney(t), t).toBeNull();
  });
});

describe('parseUnitCost', () => {
  it('accepts up to 6 euro decimals', () => {
    expect(parseUnitCost('0.027')).toBe(2.7);
    expect(parseUnitCost('7,50')).toBe(750);
    expect(parseUnitCost('0.000001')).toBe(0.0001);
  });
  it('rejects', () => {
    expect(parseUnitCost('0.0000001')).toBeNull();
    expect(parseUnitCost('-1')).toBeNull();
    expect(parseUnitCost('x')).toBeNull();
  });
});
