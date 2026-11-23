import { describe, expect, it } from 'vitest';
import { memoryBackend } from '../../src/store/memory.ts';

describe('memoryBackend', () => {
  it('puts, gets and lists rows sorted by key', async () => {
    const b = memoryBackend();
    await b.tx(['clients'], 'readwrite', async (t) => {
      await t.put('clients', { id: 'b', name: 'B' });
      await t.put('clients', { id: 'a', name: 'A' });
    });
    const rows = await b.tx(['clients'], 'readonly', (t) => t.getAll<{ id: string }>('clients'));
    expect(rows.map((r) => r.id)).toEqual(['a', 'b']);
    expect(await b.tx(['clients'], 'readonly', (t) => t.get('clients', 'a'))).toEqual({ id: 'a', name: 'A' });
  });

  it('auto-increments the outbox seq and returns it from put', async () => {
    const b = memoryBackend();
    const seqs = await b.tx(['outbox'], 'readwrite', async (t) => [
      await t.put('outbox', { path: 'x' }),
      await t.put('outbox', { path: 'y' }),
    ]);
    expect(seqs).toEqual([1, 2]);
    const rows = await b.tx(['outbox'], 'readonly', (t) => t.getAll<{ seq: number }>('outbox'));
    expect(rows.map((r) => r.seq)).toEqual([1, 2]);
  });

  it('finds rows by plain and multi-entry index', async () => {
    const b = memoryBackend();
    await b.tx(['stock'], 'readwrite', async (t) => {
      await t.put('stock', { id: 's1', classId: 'milk' });
      await t.put('stock', { id: 's2', classIds: ['milk', 'yogurt'] });
      await t.put('stock', { id: 's3', classId: 'oil' });
    });
    const ids = async (index: string, v: string) =>
      (await b.tx(['stock'], 'readonly', (t) => t.getAllByIndex<{ id: string }>('stock', index, v))).map((r) => r.id);
    expect(await ids('classId', 'milk')).toEqual(['s1']);
    expect(await ids('classIds', 'yogurt')).toEqual(['s2']);
  });

  it('rolls back every store when the transaction fails', async () => {
    const b = memoryBackend();
    await expect(
      b.tx(['clients', 'outbox'], 'readwrite', async (t) => {
        await t.put('clients', { id: 'a' });
        await t.put('outbox', { path: 'clients/a.json' });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const counts = await b.tx(['clients', 'outbox'], 'readonly', async (t) => [
      (await t.getAll('clients')).length,
      (await t.getAll('outbox')).length,
    ]);
    expect(counts).toEqual([0, 0]);
  });

  it('copies values so callers cannot mutate stored rows', async () => {
    const b = memoryBackend();
    const row = { id: 'a', tags: ['x'] };
    await b.tx(['clients'], 'readwrite', (t) => t.put('clients', row));
    row.tags.push('y');
    const got = await b.tx(['clients'], 'readonly', (t) => t.get<{ tags: string[] }>('clients', 'a'));
    expect(got?.tags).toEqual(['x']);
  });

  it('rejects writes in readonly mode and stores outside the transaction', async () => {
    const b = memoryBackend();
    await expect(b.tx(['clients'], 'readonly', (t) => t.put('clients', { id: 'a' }))).rejects.toThrow();
    await expect(b.tx(['clients'], 'readwrite', (t) => t.put('orders', { id: 'a' }))).rejects.toThrow();
  });

  it('clears a store', async () => {
    const b = memoryBackend();
    await b.tx(['meta'], 'readwrite', async (t) => {
      await t.put('meta', { key: 'k', value: 1 });
      await t.clear('meta');
    });
    expect(await b.tx(['meta'], 'readonly', (t) => t.getAll('meta'))).toEqual([]);
  });
});
