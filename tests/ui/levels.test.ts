import { describe, expect, it } from 'vitest';
import { costsFromForm, type CostForm } from '../../src/ui/screens/stock/logic.ts';
import { labourRows, levelNameError, parseMinutes, parseRate, rateText } from '../../src/ui/screens/settings/levels.ts';

const levels = [
  { id: 'a', name: 'Level 1', archived: false },
  { id: 'b', name: 'Old', archived: true },
];

describe('levelNameError', () => {
  it('requires a name', () => expect(levelNameError('  ', levels, null)).not.toBe(''));
  it('is unique among non-archived levels, case-insensitive', () => {
    expect(levelNameError(' level 1 ', levels, null)).not.toBe('');
    expect(levelNameError('Level 1', levels, 'a')).toBe('');
    expect(levelNameError('old', levels, null)).toBe('');
    expect(levelNameError('Level 2', levels, null)).toBe('');
  });
});

describe('parseRate / rateText', () => {
  it('parses euros per hour, 0 to 1000', () => {
    expect(parseRate('12,50')).toBe(1250);
    expect(parseRate('0')).toBe(0);
    expect(parseRate('1000')).toBe(100000);
    expect(parseRate('1000,01')).toBeNull();
    expect(parseRate('-1')).toBeNull();
    expect(parseRate('abc')).toBeNull();
    expect(parseRate('')).toBeNull();
  });
  it('formats with a decimal comma', () => expect(rateText(1200)).toBe('12,00'));
});

describe('parseMinutes', () => {
  it('accepts whole numbers above 0', () => {
    expect(parseMinutes(' 40 ')).toBe(40);
    expect(parseMinutes('0')).toBeNull();
    expect(parseMinutes('1,5')).toBeNull();
    expect(parseMinutes('-3')).toBeNull();
    expect(parseMinutes('')).toBeNull();
  });
});

describe('labourRows', () => {
  it('skips blank rows and parses minutes', () => {
    expect(labourRows([{ levelId: 'a', text: '40' }, { levelId: 'b', text: ' ' }])).toEqual({ rows: [{ levelId: 'a', minutes: 40 }], error: '' });
  });
  it('rejects bad minutes, missing and repeated levels', () => {
    expect(labourRows([{ levelId: 'a', text: 'x' }]).error).not.toBe('');
    expect(labourRows([{ levelId: '', text: '5' }]).error).not.toBe('');
    expect(labourRows([{ levelId: 'a', text: '5' }, { levelId: 'a', text: '6' }]).error).not.toBe('');
  });
});

describe('costsFromForm with labour', () => {
  const form: CostForm = { opened: true, mode: 'breakdown', extras: [], totalText: '', shareTexts: ['100'] };
  const outs = [{ classId: 'x', amount: 100 }];
  const labour = [{ levelId: 'a', levelName: 'Level 1', minutes: 30, hourlyRate: 1200, amount: 600 }];
  it('adds labour to the total and snapshot', () => {
    const c = costsFromForm(form, { materials: 1000, complete: true }, outs, labour).costs;
    expect(c?.labour).toEqual(labour);
    expect(c?.total).toBe(1600);
  });
  it('labour alone is enough to keep the costs', () => {
    expect(costsFromForm(form, { materials: 0, complete: false }, outs, labour).costs?.total).toBe(600);
  });
  it('total mode: other = total - materials - labour', () => {
    const c = costsFromForm({ ...form, mode: 'total', totalText: '20' }, { materials: 1000, complete: true }, outs, labour).costs;
    expect(c?.total).toBe(2000);
    expect(c?.labour).toEqual(labour);
  });
});
