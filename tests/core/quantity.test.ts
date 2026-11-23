import { describe, it, expect } from 'vitest';
import { parseAmount, parseQuantity, formatAmount, toBaseUnits } from '../../src/core/quantity.ts';

describe('parseAmount', () => {
  it('parses comma and dot', () => {
    expect(parseAmount('1,37', 3)).toBe(1370);
    expect(parseAmount('1.37', 3)).toBe(1370);
    expect(parseAmount('5', 0)).toBe(5);
  });
  it('rounds extra decimals half-up', () => {
    expect(parseAmount('1.2345', 3)).toBe(1235);
    expect(parseAmount('0.0004', 3)).toBeNull();
  });
  it('rejects invalid', () => {
    for (const t of ['', 'x', '-1', '0', '1,000.5', '1000000.001'])
      expect(parseAmount(t, 3), t).toBeNull();
    expect(parseAmount('1000000', 3)).toBe(1_000_000_000);
  });
});

describe('parseQuantity', () => {
  it('accepts integers 1-9999', () => {
    expect(parseQuantity('3')).toBe(3);
    expect(parseQuantity('9999')).toBe(9999);
  });
  it('rejects others', () => {
    for (const t of ['0', '10000', '1.5', '', 'a', '-2']) expect(parseQuantity(t), t).toBeNull();
  });
});

describe('formatAmount', () => {
  it('formats', () => {
    expect(formatAmount(1370, 3, 'kg')).toBe('1.37 kg');
    expect(formatAmount(1370, 3, 'kg', { fixed: true })).toBe('1.370 kg');
    expect(formatAmount(10000, 0, 'pcs')).toBe('10,000 pcs');
    expect(formatAmount(-500000, 3, 'kg')).toBe('−500 kg');
    expect(formatAmount(12200, 3, 'kg')).toBe('12.2 kg');
    expect(formatAmount(1500, 3)).toBe('1.5');
    expect(formatAmount(0, 3, 'kg')).toBe('0 kg');
  });
});

describe('toBaseUnits', () => {
  it('divides', () => {
    expect(toBaseUnits(1370, 3)).toBe(1.37);
    expect(toBaseUnits(5, 0)).toBe(5);
  });
});
