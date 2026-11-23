import type { Client } from './types.ts';

// Name key for duplicate checks: trimmed, lowercase, no accents, single spaces.
export function normalizeName(name: string): string {
  return name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim().replace(/\s+/g, ' ');
}

// Checks length (1-60) and finds a non-archived client with the same normalized name (§9).
export function validateClientName(
  name: string,
  existing: Pick<Client, 'id' | 'name' | 'archived'>[],
  selfId?: string,
): { error: string | null; duplicate: { id: string; name: string } | null } {
  const trimmed = name.trim();
  const error = trimmed.length === 0 ? 'Name is required' : trimmed.length > 60 ? 'Name is too long (max 60)' : null;
  const key = normalizeName(name);
  const dup = existing.find((c) => !c.archived && c.id !== selfId && normalizeName(c.name) === key);
  return { error, duplicate: dup ? { id: dup.id, name: dup.name } : null };
}
