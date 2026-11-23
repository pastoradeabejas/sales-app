import { describe, expect, it } from 'vitest';
import type { Backend } from '../../src/store/backend.ts';
import { memoryBackend } from '../../src/store/memory.ts';
import { createStore, type FileEntry, type StoreName } from '../../src/store/store.ts';
import type { Client, StockTransform } from '../../src/core/types.ts';

let clock = 0;
const now = () => `2026-11-23T10:00:${String(clock++ % 60).padStart(2, '0')}.000Z`;

function setup(opts: { demo?: boolean; backend?: Backend } = {}) {
  const backend = opts.backend ?? memoryBackend();
  const store = createStore(backend, { now, deviceName: () => 'Phone A', demo: () => opts.demo ?? false });
  return { backend, store };
}

const marta = { id: 'c1', name: 'Marta', phone: '', notes: '', tags: [], archived: false };
const path = 'clients/c1.json';

describe('store: records', () => {
  it('saves a new record with stamps and reads it back', async () => {
    const { store } = setup();
    const saved = await store.save('client', marta, path);
    expect(saved).toMatchObject({ ...marta, schema: 1, updatedBy: 'Phone A' });
    expect(saved.createdAt).toBe(saved.updatedAt);
    expect(await store.get<Client>('clients', 'c1')).toEqual(saved);
    expect(await store.all<Client>('clients')).toEqual([saved]);
  });

  it('keeps createdAt on edit and refreshes updatedAt', async () => {
    const { store } = setup();
    const first = await store.save('client', marta, path);
    const second = await store.save('client', { ...first, name: 'Marta R.' });
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.updatedAt).not.toBe(first.updatedAt);
  });

  it('finds records by index, including transform classIds, without leaking the index field', async () => {
    const { store } = setup();
    const t = {
      id: 's1', date: '2026-11-22', type: 'transform', recipeId: null, costs: null, note: '', voided: false,
      inputs: [{ classId: 'milk', amount: 500000 }], outputs: [{ classId: 'yogurt', amount: 10000 }],
    };
    await store.save('stock', t, 'stock/2026/11/s1.json');
    const found = await store.byIndex<StockTransform>('stock', 'classIds', 'yogurt');
    expect(found.map((r) => r.id)).toEqual(['s1']);
    expect('classIds' in found[0]).toBe(false);
    const outbox = await store.outbox();
    expect('classIds' in (outbox[0].content as object)).toBe(false);
  });

  it('needs a path for a record it has never seen', async () => {
    const { store } = setup();
    await expect(store.save('client', marta)).rejects.toThrow();
  });
});

describe('store: write path and outbox', () => {
  it('writes the record and one outbox entry', async () => {
    const { store } = setup();
    const saved = await store.save('client', marta, path);
    const [e] = await store.outbox();
    expect(e).toMatchObject({ path, recordType: 'client', recordId: 'c1', op: 'put', content: saved, baseSha: null, attempts: 0, lastError: null });
    expect(typeof e.seq).toBe('number');
    expect(await store.outboxCount()).toBe(1);
  });

  it('writes neither record nor outbox entry when the transaction fails', async () => {
    const inner = memoryBackend();
    const failing: Backend = {
      tx: (tables, mode, fn) =>
        inner.tx(tables, mode, (t) =>
          fn({ ...t, put: (table, v) => (table === 'outbox' ? Promise.reject(new Error('disk full')) : t.put(table, v)) }),
        ),
    };
    const { store } = setup({ backend: failing });
    await expect(store.save('client', marta, path)).rejects.toThrow('disk full');
    const clean = setup({ backend: inner }).store;
    expect(await clean.all('clients')).toEqual([]);
    expect(await clean.outbox()).toEqual([]);
  });

  it('collapses repeated edits into one entry with the latest content', async () => {
    const { store } = setup();
    await store.save('client', marta, path);
    await store.save('client', { ...marta, name: 'Marta 2' });
    const last = await store.save('client', { ...marta, name: 'Marta 3' });
    const entries = await store.outbox();
    expect(entries).toHaveLength(1);
    expect(entries[0].content).toEqual(last);
  });

  it('appends a new entry when the pending one is in flight', async () => {
    const { store } = setup();
    await store.save('client', marta, path);
    const [e] = await store.outbox();
    store.markInFlight(e.seq!);
    await store.save('client', { ...marta, name: 'Marta 2' });
    expect(await store.outboxCount()).toBe(2);
    await store.markAttempt(e.seq!, 'network');
    await store.save('client', { ...marta, name: 'Marta 3' });
    const entries = await store.outbox();
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ attempts: 1, lastError: 'network' });
    expect((entries[0].content as Client).name).toBe('Marta');
    expect((entries[1].content as Client).name).toBe('Marta 3');
  });

  it('keeps the original path on edits (from files, else from the outbox)', async () => {
    const { store } = setup();
    await store.save('order', { id: 'o1', date: '2026-10-31' }, 'orders/2026/10/o1.json');
    await store.save('order', { id: 'o1', date: '2026-11-02' }, 'orders/2026/11/o1.json');
    expect((await store.outbox()).map((e) => e.path)).toEqual(['orders/2026/10/o1.json']);

    await store.putFile({ path: 'orders/2026/09/o2.json', blobSha: 'sha1', recordType: 'order', recordId: 'o2' });
    await store.save('order', { id: 'o2', date: '2026-11-02' }, 'orders/2026/11/o2.json');
    const e2 = (await store.outbox()).find((e) => e.recordId === 'o2');
    expect(e2).toMatchObject({ path: 'orders/2026/09/o2.json', baseSha: 'sha1' });
  });

  it('writes no outbox entries in demo mode', async () => {
    const { store } = setup({ demo: true });
    await store.save('client', marta);
    expect(await store.get('clients', 'c1')).toBeDefined();
    expect(await store.outboxCount()).toBe(0);
  });

  it('saveMany writes all records and entries together', async () => {
    const { store } = setup();
    const out = await store.saveMany([
      { type: 'order', record: { id: 'o1', voided: true }, path: 'orders/2026/11/o1.json' },
      { type: 'payment', record: { id: 'p1', voided: true }, path: 'payments/2026/11/p1.json' },
    ]);
    expect(out.map((r) => r.id)).toEqual(['o1', 'p1']);
    expect((await store.outbox()).map((e) => e.recordId)).toEqual(['o1', 'p1']);
  });

  it('completePush removes the entry and stores the blob sha', async () => {
    const { store } = setup();
    await store.save('client', marta, path);
    const [e] = await store.outbox();
    store.markInFlight(e.seq!);
    await store.completePush(e.seq!, path, 'sha-new', 'client', 'c1');
    expect(await store.outboxCount()).toBe(0);
    expect((await store.files()).get(path)).toEqual({ path, blobSha: 'sha-new', recordType: 'client', recordId: 'c1' });
    await store.save('client', { ...marta, name: 'M' });
    expect((await store.outbox())[0]).toMatchObject({ path, baseSha: 'sha-new' });
  });

  it('dropOutboxFor removes every entry of a path', async () => {
    const { store } = setup();
    await store.save('client', marta, path);
    await store.save('client', { ...marta, id: 'c2' }, 'clients/c2.json');
    await store.dropOutboxFor(path);
    expect((await store.outbox()).map((e) => e.path)).toEqual(['clients/c2.json']);
  });

  it('dropOutboxEntry keeps an edit saved while that entry was being pushed', async () => {
    const { store } = setup();
    await store.save('client', marta, path);
    const [first] = await store.outbox();
    store.markInFlight(first.seq!);
    await store.save('client', { ...marta, name: 'Marta R.' });
    await store.dropOutboxEntry(first.seq!);
    const left = await store.outbox();
    expect(left).toHaveLength(1);
    expect(left[0].content).toMatchObject({ name: 'Marta R.' });
  });
});

describe('store: sync helpers', () => {
  it('applyRemote writes the record and files row without an outbox entry', async () => {
    const { store } = setup();
    const remote = { ...marta, schema: 1, createdAt: 'x', updatedAt: 'y', updatedBy: 'Mac' };
    const file: FileEntry = { path, blobSha: 'abc', recordType: 'client', recordId: 'c1' };
    await store.applyRemote('client', remote, file);
    expect(await store.get('clients', 'c1')).toEqual(remote);
    expect((await store.files()).get(path)).toEqual(file);
    expect(await store.outboxCount()).toBe(0);
  });

  it('stores meta values', async () => {
    const { store } = setup();
    expect(await store.getMeta('lastSyncedCommitSha')).toBeUndefined();
    await store.setMeta('lastSyncedCommitSha', 'c0ffee');
    expect(await store.getMeta('lastSyncedCommitSha')).toBe('c0ffee');
  });

  it('importRecords keeps stamps and writes through the outbox', async () => {
    const { store } = setup();
    const rec = { ...marta, schema: 1, createdAt: 'a', updatedAt: 'b', updatedBy: 'Mac' };
    await store.importRecords([{ type: 'client', record: rec, path }]);
    expect(await store.get('clients', 'c1')).toEqual(rec);
    expect((await store.outbox())[0]).toMatchObject({ path, content: rec });
  });

  it('clearAll empties records, outbox, files and meta', async () => {
    const { store } = setup();
    await store.save('client', marta, path);
    await store.putFile({ path: 'p', blobSha: 's', recordType: 'client', recordId: 'x' });
    await store.setMeta('k', 1);
    await store.clearAll();
    expect(await store.all('clients')).toEqual([]);
    expect(await store.outboxCount()).toBe(0);
    expect((await store.files()).size).toBe(0);
    expect(await store.getMeta('k')).toBeUndefined();
  });
});

describe('store: subscribe and reload', () => {
  it('notifies listeners with the changed stores after commit, until unsubscribed', async () => {
    const { store } = setup();
    const calls: StoreName[][] = [];
    const off = store.subscribe((s) => calls.push(s.filter((n): n is StoreName => n !== 'outbox' && n !== 'files' && n !== 'meta')));
    await store.saveMany([
      { type: 'order', record: { id: 'o1' }, path: 'orders/2026/11/o1.json' },
      { type: 'payment', record: { id: 'p1' }, path: 'payments/2026/11/p1.json' },
    ]);
    expect(calls).toEqual([['orders', 'payments']]);
    off();
    await store.save('client', marta, path);
    expect(calls).toHaveLength(1);
  });

  it('does not notify when the write fails', async () => {
    const { store } = setup();
    let called = false;
    store.subscribe(() => (called = true));
    await expect(store.save('client', marta)).rejects.toThrow();
    expect(called).toBe(false);
  });

  it('a new store over the same backend sees the data', async () => {
    const { backend, store } = setup();
    await store.save('client', marta, path);
    const again = createStore(backend);
    expect((await again.get<Client>('clients', 'c1'))?.name).toBe('Marta');
    expect(await again.outboxCount()).toBe(1);
  });
});
