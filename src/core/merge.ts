// Last-writer-wins merge (spec §6.4).
import { serializeRecord } from './serialize.ts';
import type { RecordType } from './types.ts';

type Stamp = { updatedAt: string; updatedBy: string };

/**
 * Which side is newer: later updatedAt wins; on a tie the lexically GREATER
 * updatedBy wins (arbitrary but identical on every device); same stamp gives 'a'.
 */
export function newerOf<T extends Stamp>(a: T, b: T): 'a' | 'b' {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? 'a' : 'b';
  return b.updatedBy > a.updatedBy ? 'b' : 'a';
}

/** Merge variants by id (LWW each); variants on only one side are kept. */
function mergeVariants(local: any[], remote: any[]): any[] {
  const byId = new Map<string, any>(local.map((v) => [v.id, v]));
  for (const r of remote) {
    const l = byId.get(r.id);
    byId.set(r.id, !l || newerOf(l, r) === 'b' ? r : l);
  }
  return [...byId.values()].sort((x, y) => x.sortOrder - y.sortOrder || (x.id < y.id ? -1 : 1));
}

/** Merge a remote record into the local one; remoteWon = local lost something. */
export function mergeRecord(type: RecordType, local: any | undefined, remote: any): { merged: any; remoteWon: boolean } {
  if (!local) return { merged: remote, remoteWon: true };
  const winner = newerOf(local, remote) === 'a' ? local : remote;
  const merged = type === 'product'
    ? { ...winner, variants: mergeVariants(local.variants ?? [], remote.variants ?? []) }
    : winner;
  const same = serializeRecord(type, merged) === serializeRecord(type, local);
  return { merged: same ? local : merged, remoteWon: !same };
}

/** Outcome for a local record with a pending outbox entry meeting a remote version. */
export function resolvePending(local: any, remote: any, type: RecordType): { merged: any; dropOutbox: boolean; toast: boolean } {
  const { merged, remoteWon } = mergeRecord(type, local, remote);
  if (!remoteWon) return { merged, dropOutbox: false, toast: false };
  // A merge that differs from remote (products) still has to be pushed.
  const dropOutbox = serializeRecord(type, merged) === serializeRecord(type, remote);
  return { merged, dropOutbox, toast: true };
}
