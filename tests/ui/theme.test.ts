import { describe, expect, it } from 'vitest';
import { parseThemePref, resolveTheme } from '../../src/ui/theme.ts';

describe('parseThemePref', () => {
  it('keeps valid values', () => {
    expect(parseThemePref('light')).toBe('light');
    expect(parseThemePref('dark')).toBe('dark');
    expect(parseThemePref('system')).toBe('system');
    expect(parseThemePref('blue')).toBe('blue');
  });

  it('falls back to system for missing or bad values', () => {
    for (const v of [null, undefined, '', 'Dark', 'Blue']) expect(parseThemePref(v)).toBe('system');
  });
});

describe('resolveTheme', () => {
  it('follows the system when the preference is system', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('ignores the system for an explicit choice', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('blue', false)).toBe('blue');
    expect(resolveTheme('blue', true)).toBe('blue');
  });
});
