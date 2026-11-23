import { describe, it, expect } from 'vitest';
import { normalizeName, validateClientName } from '../../src/core/clients.ts';

const existing = [
  { id: 'a', name: 'José  Pérez', archived: false },
  { id: 'b', name: 'Marta', archived: true },
];

describe('normalizeName', () => {
  it('trims, lowercases, strips accents, collapses spaces', () => {
    expect(normalizeName('  José   PÉREZ ')).toBe('jose perez');
  });
});

describe('validateClientName', () => {
  it('requires 1-60 chars', () => {
    expect(validateClientName('  ', existing).error).not.toBeNull();
    expect(validateClientName('x'.repeat(61), existing).error).not.toBeNull();
    expect(validateClientName('x'.repeat(60), existing).error).toBeNull();
  });
  it('finds duplicates among non-archived', () => {
    expect(validateClientName('jose perez', existing).duplicate).toEqual({ id: 'a', name: 'José  Pérez' });
    expect(validateClientName('marta', existing).duplicate).toBeNull();
  });
  it('ignores self', () => {
    expect(validateClientName('Jose Perez', existing, 'a').duplicate).toBeNull();
  });
});
