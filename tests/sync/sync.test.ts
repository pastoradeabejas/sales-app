import { describe, expect, it, vi } from 'vitest';
import { recordPath } from '../../src/core/paths.ts';
import { metaContent, serializeRecord } from '../../src/core/serialize.ts';
import { memoryBackend } from '../../src/store/memory.ts';
import { createStore } from '../../src/store/store.ts';
import { createGitHub } from '../../src/sync/github.ts';
import { pull } from '../../src/sync/pull.ts';
import { pushOutbox } from '../../src/sync/push.ts';
import { fakeGitHub } from './fakeGitHub.ts';

const NOW = '2026-11-24T12:00:00.000Z';
const OLD = '2026-11-23T09:00:00.000Z'; // before every local save
const NEW = '2026-11-23T11:00:00.000Z'; // after every local save

function device(fake: ReturnType<typeof fakeGitHub>, deviceName = 'Phone A') {
  let clock = 0;
  const store = createStore(memoryBackend(), {
    now: () => `2026-11-23T10:00:${String(clock++).padStart(2, '0')}.000Z`,
    deviceName: () => deviceName,
  });
  const gh = createGitHub({ repo: 'owner/data', branch: 'main', token: 't', fetch: fake.fetch });
  return { store, gh, deps: { gh, store, deviceName, now: () => NOW } };
}

const stamp = (updatedAt: string, updatedBy: string) => ({ schema: 1, createdAt: OLD, updatedAt, updatedBy });
const client = (id: string, name: string, s = stamp(OLD, 'Phone B')) =>
  ({ id, name, phone: '', notes: '', tags: [], archived: false, ...s });
const clientFile = (c: ReturnType<typeof client>) => serializeRecord('client', c);
const order = (s = stamp(OLD, 'Phone B'), note = '') => ({
  id: 'o1', date: '2026-11-20', clientId: 'c1', clientName: 'Marta', note, voided: false, voidReason: null, total: 2800,
  lines: [{ lineId: 'l1', classId: 'p', variantId: 'v', className: 'Parmigiano Reggiano', variantLabel: '500 g', kind: 'fixed',
    unitName: 'kg', decimals: 3, quantity: 2, amount: 1000, unitPrice: 1400, unitCost: null, lineTotal: 2800 }],
  ...s,
});
const ORDER_PATH = recordPath('order', { id: 'o1', date: '2026-11-20' });
const puts = (fake: ReturnType<typeof fakeGitHub>) => fake.requests.filter((r) => r.method === 'PUT');

describe('pull (§6.3)', () => {
  it('initial sync downloads N files with progress and concurrency 6', async () => {
    const initial: Record<string, string> = { 'meta.json': metaContent(OLD), 'README.md': '# data\n' };
    for (let i = 0; i < 30; i++) initial[`clients/c${i}.json`] = clientFile(client(`c${i}`, `Client ${i}`));
    const fake = fakeGitHub(initial);
    let inFlight = 0;
    let maxInFlight = 0;
    const slowFetch = (async (...args: Parameters<typeof fetch>) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      for (let i = 0; i < 5; i++) await Promise.resolve();
      inFlight--;
      return fake.fetch(...args);
    }) as typeof fetch;
    const { store } = device(fake);
    const gh = createGitHub({ repo: 'owner/data', branch: 'main', token: 't', fetch: slowFetch });
    const progress: [number, number][] = [];
    await pull({ gh, store, deviceName: 'Phone A', now: () => NOW }, (done, total) => progress.push([done, total]));
    expect((await store.all('clients')).length).toBe(30);
    expect((await store.files()).size).toBe(30);
    expect(progress[0]).toEqual([0, 31]);
    expect(progress.at(-1)).toEqual([31, 31]);
    expect(maxInFlight).toBe(6);
    expect(await store.getMeta('lastSyncedCommitSha')).toBe('c1');
    expect(await store.getMeta('lastSyncAt')).toBe(NOW);
    expect(await store.getMeta('schemaVersion')).toBe(1);
  });

  it('makes exactly 1 request when nothing changed', async () => {
    const fake = fakeGitHub({ 'clients/c1.json': clientFile(client('c1', 'Marta')) });
    const { deps } = device(fake);
    await pull(deps);
    fake.requests.length = 0;
    expect(await pull(deps)).toMatchObject({ changed: 0 });
    expect(fake.requests).toHaveLength(1);
  });

  it('fetches only changed files and warns about files missing remotely', async () => {
    const fake = fakeGitHub({ 'clients/c1.json': clientFile(client('c1', 'Marta')), 'clients/c2.json': clientFile(client('c2', 'Ana')) });
    const { deps, store } = device(fake);
    await pull(deps);
    fake.commitRemote('clients/c1.json', clientFile(client('c1', 'Marta G.', stamp(NEW, 'Phone B'))));
    fake.files.delete('clients/c2.json');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fake.requests.length = 0;
    await pull(deps);
    expect(fake.requests.map((r) => r.url.split('/data/')[1].split('/')[0])).toEqual(['commits', 'git', 'git']);
    expect((await store.get<any>('clients', 'c1'))?.name).toBe('Marta G.');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('clients/c2.json'));
    warn.mockRestore();
  });

  it('falls back to folder listing when the tree is truncated (§6.6)', async () => {
    const fake = fakeGitHub({ 'clients/c1.json': clientFile(client('c1', 'Marta')), [ORDER_PATH]: serializeRecord('order', order()) }, { truncated: true });
    const { deps, store } = device(fake);
    await pull(deps);
    expect((await store.files()).size).toBe(2);
    expect((await store.get<any>('orders', 'o1'))?.clientName).toBe('Marta');
  });

  it('a newer remote beats a pending local edit: entry dropped and toast (§6.4)', async () => {
    const fake = fakeGitHub({ [ORDER_PATH]: serializeRecord('order', order()) });
    const { deps, store } = device(fake);
    await pull(deps);
    await store.save('order', { ...order(), note: 'local' });
    fake.commitRemote(ORDER_PATH, serializeRecord('order', order(stamp(NEW, 'Phone B'), 'remote')));
    const res = await pull(deps);
    expect(res.toasts).toEqual(["Marta's order was changed on Phone B; showing the latest version"]);
    expect(await store.outboxCount()).toBe(0);
    expect((await store.get<any>('orders', 'o1'))?.note).toBe('remote');
    expect((await store.files()).get(ORDER_PATH)?.blobSha).toBe(fake.shaOf(ORDER_PATH));
  });

  it('a pending local edit that wins stays queued and is pushed over the remote', async () => {
    const fake = fakeGitHub({ [ORDER_PATH]: serializeRecord('order', order()) });
    const { deps, store } = device(fake);
    await pull(deps);
    await store.save('order', { ...order(), note: 'local' });
    fake.commitRemote(ORDER_PATH, serializeRecord('order', order(stamp(OLD, 'Phone C'), 'remote')));
    expect((await pull(deps)).toasts).toEqual([]);
    expect(await store.outboxCount()).toBe(1);
    await pushOutbox(deps);
    expect(JSON.parse(fake.files.get(ORDER_PATH)!).note).toBe('local');
  });

  it('records a newer meta.json schema (read-only)', async () => {
    const fake = fakeGitHub({ 'meta.json': '{"app":"sales-bookkeeping","schemaVersion":2}\n' });
    const { deps, store } = device(fake);
    expect((await pull(deps)).readOnly).toBe(true);
    expect(await store.getMeta('schemaVersion')).toBe(2);
  });
});

describe('push (§6.2)', () => {
  it('pushes, stores the blob sha, empties the outbox and advances the head', async () => {
    const fake = fakeGitHub({ 'meta.json': metaContent(OLD) });
    const { deps, store } = device(fake);
    await pull(deps);
    const saved = await store.save('client', client('c1', 'Marta'), 'clients/c1.json');
    const res = await pushOutbox(deps);
    expect(res).toEqual({ pushed: 1, conflicts: 0, toasts: [], stopped: null });
    expect(puts(fake)[0].body.message).toBe('[Phone A] client: Marta');
    expect(fake.files.get('clients/c1.json')).toBe(serializeRecord('client', saved));
    expect(await store.outboxCount()).toBe(0);
    expect((await store.files()).get('clients/c1.json')?.blobSha).toBe(fake.shaOf('clients/c1.json'));
    expect(await store.getMeta('lastSyncedCommitSha')).toBe('c2');
  });

  it('leaves lastSyncedCommitSha for the puller when someone else committed first', async () => {
    const fake = fakeGitHub({ 'meta.json': metaContent(OLD) });
    const { deps, store } = device(fake);
    await pull(deps);
    fake.commitRemote('clients/x.json', clientFile(client('x', 'X')));
    await store.save('client', client('c1', 'Marta'), 'clients/c1.json');
    await pushOutbox(deps);
    expect(await store.getMeta('lastSyncedCommitSha')).toBe('c1');
  });

  it('collapses repeated edits into one PUT', async () => {
    const fake = fakeGitHub();
    const { deps, store } = device(fake);
    for (const name of ['M', 'Ma', 'Marta']) await store.save('client', client('c1', name), 'clients/c1.json');
    await pushOutbox(deps);
    expect(puts(fake)).toHaveLength(1);
    expect(JSON.parse(fake.files.get('clients/c1.json')!).name).toBe('Marta');
  });

  it('409: merges with the remote and retries with its sha (local wins)', async () => {
    const fake = fakeGitHub({ 'clients/c1.json': clientFile(client('c1', 'Marta')) });
    const { deps, store } = device(fake);
    await pull(deps);
    await store.save('client', { ...client('c1', 'Marta local') });
    fake.commitRemote('clients/c1.json', clientFile(client('c1', 'Marta remote', stamp(OLD, 'Phone C'))));
    const res = await pushOutbox(deps);
    expect(res).toMatchObject({ pushed: 1, conflicts: 1, toasts: [], stopped: null });
    expect(puts(fake)).toHaveLength(2);
    expect(JSON.parse(fake.files.get('clients/c1.json')!).name).toBe('Marta local');
    expect(await store.outboxCount()).toBe(0);
  });

  it('409: a newer remote wins, the entry is dropped with a toast', async () => {
    const fake = fakeGitHub({ 'clients/c1.json': clientFile(client('c1', 'Marta')) });
    const { deps, store } = device(fake);
    await pull(deps);
    await store.save('client', client('c1', 'Marta local'));
    fake.commitRemote('clients/c1.json', clientFile(client('c1', 'Marta remote', stamp(NEW, 'Phone B'))));
    const res = await pushOutbox(deps);
    expect(res).toMatchObject({ pushed: 0, conflicts: 1, toasts: ['Marta remote was changed on Phone B; showing the latest version'] });
    expect(puts(fake)).toHaveLength(1);
    expect((await store.get<any>('clients', 'c1'))?.name).toBe('Marta remote');
    expect(await store.outboxCount()).toBe(0);
  });

  it('gives up after 3 conflicting attempts and keeps the entry with lastError', async () => {
    const fake = fakeGitHub();
    const { deps, store } = device(fake);
    await store.save('client', client('c1', 'Marta'), 'clients/c1.json');
    for (let i = 0; i < 3; i++) fake.failNext('PUT', /contents/, 409);
    const res = await pushOutbox(deps);
    expect(res).toMatchObject({ pushed: 0, conflicts: 3, stopped: null });
    expect(puts(fake)).toHaveLength(3);
    const [e] = await store.outbox();
    expect(e.attempts).toBe(3);
    expect(e.lastError).toMatch(/conflict/i);
  });

  it('401 stops the queue', async () => {
    const fake = fakeGitHub();
    const { deps, store } = device(fake);
    await store.save('client', client('c1', 'Marta'), 'clients/c1.json');
    await store.save('client', client('c2', 'Ana'), 'clients/c2.json');
    fake.failNext('PUT', /contents/, 401);
    expect((await pushOutbox(deps)).stopped).toBe('auth');
    expect(puts(fake)).toHaveLength(1);
    expect(await store.outboxCount()).toBe(2);
    expect((await store.outbox())[0].lastError).toBe('Token invalid or expired');
  });

  it('network and server errors stop with retry and keep the entry', async () => {
    const fake = fakeGitHub();
    const { deps, store } = device(fake);
    await store.save('client', client('c1', 'Marta'), 'clients/c1.json');
    fake.failNext('PUT', /contents/, 'network');
    expect((await pushOutbox(deps)).stopped).toBe('retry');
    fake.failNext('PUT', /contents/, 503);
    expect((await pushOutbox(deps)).stopped).toBe('retry');
    expect(await store.outboxCount()).toBe(1);
    expect((await pushOutbox(deps)).pushed).toBe(1);
  });

  it('does not push when the data repo schema is newer (read-only)', async () => {
    const fake = fakeGitHub();
    const { deps, store } = device(fake);
    await store.save('client', client('c1', 'Marta'), 'clients/c1.json');
    await store.setMeta('schemaVersion', 2);
    expect((await pushOutbox(deps)).stopped).toBe('readOnly');
    expect(fake.requests).toHaveLength(0);
  });

  it('round-trips UTF-8 ("Lucía") from one device to another', async () => {
    const fake = fakeGitHub();
    const a = device(fake, 'Phone A');
    await a.store.save('client', client('c1', 'Lucía'), 'clients/c1.json');
    await pushOutbox(a.deps);
    expect(fake.files.get('clients/c1.json')).toContain('"name": "Lucía"');
    const b = device(fake, 'Phone B');
    await pull(b.deps);
    expect((await b.store.get<any>('clients', 'c1'))?.name).toBe('Lucía');
  });
});
