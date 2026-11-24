import { describe, expect, it } from 'vitest';
import { formatBuildTime } from '../../src/ui/months.ts';

describe('formatBuildTime', () => {
  it('shows the build moment in local time, day month year hh:mm', () => {
    expect(formatBuildTime(new Date(2026, 10, 24, 23, 43).toISOString())).toBe('24 Nov 2026 23:43');
    expect(formatBuildTime(new Date(2026, 0, 5, 7, 4).toISOString())).toBe('5 Jan 2026 07:04');
  });
  it('is empty for a missing or broken value', () => {
    expect(formatBuildTime('')).toBe('');
    expect(formatBuildTime('dev')).toBe('');
  });
});
