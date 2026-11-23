import { describe, expect, it } from 'vitest';
import { mergeRecord, newerOf, resolvePending } from '../../src/core/merge.ts';

const st = (updatedAt: string, updatedBy = 'Phone A') => ({ updatedAt, updatedBy });

describe('newerOf', () => {
  it('later updatedAt wins', () => {
    expect(newerOf(st('2026-01-01T10:00:00Z'), st('2026-01-01T10:00:01Z'))).toBe('b');
    expect(newerOf(st('2026-01-02T10:00:00Z'), st('2026-01-01T10:00:01Z'))).toBe('a');
  });
  it('tie: lexically greater updatedBy wins', () => {
    expect(newerOf(st('t', 'Phone A'), st('t', 'Phone B'))).toBe('b');
    expect(newerOf(st('t', 'Phone B'), st('t', 'Phone A'))).toBe('a');
  });
  it('identical stamp gives a', () => {
    expect(newerOf(st('t'), st('t'))).toBe('a');
  });
});

describe('mergeRecord generic', () => {
  it('takes remote when no local', () => {
    const r = { id: 'c', name: 'M', ...st('t') };
    expect(mergeRecord('client', undefined, r)).toEqual({ merged: r, remoteWon: true });
  });
  it('remote newer wins', () => {
    const l = { id: 'c', name: 'old', ...st('2026-01-01') };
    const r = { id: 'c', name: 'new', ...st('2026-01-02', 'Phone B') };
    expect(mergeRecord('client', l, r)).toEqual({ merged: r, remoteWon: true });
  });
  it('local newer wins', () => {
    const l = { id: 'c', name: 'new', ...st('2026-01-02') };
    const r = { id: 'c', name: 'old', ...st('2026-01-01', 'Phone B') };
    expect(mergeRecord('client', l, r)).toEqual({ merged: l, remoteWon: false });
  });
  it('same content is not a remote win', () => {
    const l = { id: 'c', name: 'M', ...st('t') };
    expect(mergeRecord('client', l, { ...l }).remoteWon).toBe(false);
  });
});

const variant = (id: string, price: number, updatedAt: string, updatedBy = 'Phone A') => ({
  id, label: id, kind: 'fixed', baseAmount: 1, price, cost: null, sortOrder: 1, archived: false,
  createdAt: '2026-01-01', updatedAt, updatedBy,
});
const product = (name: string, updatedAt: string, variants: unknown[], updatedBy = 'Phone A') => ({
  id: 'p', schema: 1, name, variants, createdAt: '2026-01-01', updatedAt, updatedBy,
});

describe('mergeRecord product', () => {
  it('keeps a variant added on one phone and a price changed on the other', () => {
    const local = product('P', '2026-01-03', [variant('v1', 100, '2026-01-01'), variant('v2', 200, '2026-01-03')]);
    const remote = product('P', '2026-01-02', [variant('v1', 150, '2026-01-02', 'Phone B')], 'Phone B');
    const { merged, remoteWon } = mergeRecord('product', local, remote);
    expect(merged.variants.map((v: any) => [v.id, v.price])).toEqual([['v1', 150], ['v2', 200]]);
    expect(merged.updatedAt).toBe('2026-01-03');
    expect(remoteWon).toBe(true);
  });
  it('class-level fields come from the newer class stamp', () => {
    const local = product('Local', '2026-01-01', [variant('v1', 1, '2026-01-01')]);
    const remote = product('Remote', '2026-01-02', [variant('v1', 1, '2026-01-01')], 'Phone B');
    expect(mergeRecord('product', local, remote).merged.name).toBe('Remote');
  });
  it('local wins everywhere gives remoteWon false', () => {
    const local = product('L', '2026-01-03', [variant('v1', 9, '2026-01-03')]);
    const remote = product('R', '2026-01-02', [variant('v1', 1, '2026-01-02')], 'Phone B');
    const res = mergeRecord('product', local, remote);
    expect(res.remoteWon).toBe(false);
    expect(res.merged.name).toBe('L');
  });
});

describe('resolvePending', () => {
  it('local pending loses: drop outbox and toast', () => {
    const l = { id: 'c', name: 'old', ...st('2026-01-01') };
    const r = { id: 'c', name: 'new', ...st('2026-01-02', 'Phone B') };
    expect(resolvePending(l, r, 'client')).toEqual({ merged: r, dropOutbox: true, toast: true });
  });
  it('local pending wins: keep outbox, no toast', () => {
    const l = { id: 'c', name: 'new', ...st('2026-01-02') };
    const r = { id: 'c', name: 'old', ...st('2026-01-01', 'Phone B') };
    expect(resolvePending(l, r, 'client')).toEqual({ merged: l, dropOutbox: false, toast: false });
  });
  it('product merged differs from both: keep outbox so merge is pushed', () => {
    const local = product('P', '2026-01-03', [variant('v1', 100, '2026-01-01'), variant('v2', 200, '2026-01-03')]);
    const remote = product('P', '2026-01-02', [variant('v1', 150, '2026-01-02', 'Phone B')], 'Phone B');
    const res = resolvePending(local, remote, 'product');
    expect(res.dropOutbox).toBe(false);
    expect(res.toast).toBe(true);
    expect(res.merged.variants).toHaveLength(2);
  });
  it('product where remote wins entirely: drop outbox', () => {
    const local = product('P', '2026-01-01', [variant('v1', 1, '2026-01-01')]);
    const remote = product('P', '2026-01-02', [variant('v1', 2, '2026-01-02', 'Phone B')], 'Phone B');
    expect(resolvePending(local, remote, 'product')).toMatchObject({ dropOutbox: true, toast: true });
  });
});
