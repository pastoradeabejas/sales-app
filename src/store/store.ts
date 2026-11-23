// Local store (spec §5): records, outbox and sync bookkeeping over a Backend; every write is one transaction.
import { SCHEMA_VERSION, type Id, type RecordType, type Stamped, type Timestamp } from '../core/types.ts';
import type { Backend, Key, StoreName, TableName, Tx } from './backend.ts';

export type { StoreName, TableName } from './backend.ts';

/** Object store of each record type. */
export const STORE_OF: Record<RecordType, StoreName> = {
  product: 'products',
  client: 'clients',
  order: 'orders',
  payment: 'payments',
  stock: 'stock',
  recipe: 'recipes',
};

/** One pending push of a record file (§5, §6.2); content is the record object, serialised at push time. */
export interface OutboxEntry {
  seq?: number;
  path: string;
  recordType: RecordType;
  recordId: Id;
  op: 'put';
  content: unknown;
  baseSha: string | null;
  attempts: number;
  lastError: string | null;
  createdAt: Timestamp;
}

/** Last known remote blob SHA of one file. */
export interface FileEntry {
  path: string;
  blobSha: string;
  recordType: RecordType;
  recordId: Id;
}

/** A record to write; `path` is needed only the first time a record is saved outside demo mode. */
export interface SaveItem<T extends { id: Id } = { id: Id }> {
  type: RecordType;
  record: T;
  path?: string;
}

export type Saved<T> = T & Stamped & { schema: number };

export interface StoreOptions {
  now?: () => Timestamp;
  deviceName?: () => string;
  demo?: () => boolean;
}

export type Store = ReturnType<typeof createStore>;

const ALL: TableName[] = ['products', 'clients', 'orders', 'payments', 'stock', 'recipes', 'files', 'outbox', 'meta'];
const unique = <T>(xs: T[]) => [...new Set(xs)];

// Transforms get a derived `classIds` field so the multi-entry index can find them; it never leaves the store.
type Row = Record<string, unknown>;
function toRow(store: StoreName, rec: Row): Row {
  if (store !== 'stock' || rec.type !== 'transform') return rec;
  const sides = [...(rec.inputs as { classId: Id }[]), ...(rec.outputs as { classId: Id }[])];
  return { ...rec, classIds: unique(sides.map((s) => s.classId)) };
}
function fromRow<T>(row: unknown): T {
  if (!row || typeof row !== 'object' || !('classIds' in row)) return row as T;
  const { classIds: _, ...rec } = row as Row;
  return rec as T;
}

/** Creates the store over a backend (idbBackend in the app, memoryBackend in tests). */
export function createStore(backend: Backend, opts: StoreOptions = {}) {
  const now = opts.now ?? (() => new Date().toISOString());
  const deviceName = opts.deviceName ?? (() => '');
  const demo = opts.demo ?? (() => false);
  const listeners = new Set<(changed: TableName[]) => void>();
  const inFlight = new Set<number>();

  const read = <R>(tables: TableName[], fn: (t: Tx) => Promise<R>) => backend.tx(tables, 'readonly', fn);
  async function write<R>(tables: TableName[], fn: (t: Tx) => Promise<R>): Promise<R> {
    const result = await backend.tx(tables, 'readwrite', fn);
    for (const l of listeners) l(tables);
    return result;
  }

  async function pathOf(t: Tx, type: RecordType, id: Id, given?: string): Promise<string> {
    const file = (await t.getAllByIndex<FileEntry>('files', 'recordId', id)).find((f) => f.recordType === type);
    const queued = (await t.getAllByIndex<OutboxEntry>('outbox', 'recordId', id)).find((e) => e.recordType === type);
    const path = file?.path ?? queued?.path ?? given;
    if (!path) throw new Error(`no path for ${type} ${id}`);
    return path;
  }

  // Collapses into the latest entry of the same path unless it is being pushed (§5).
  async function enqueue(t: Tx, type: RecordType, record: { id: Id }, path: string) {
    const pending = (await t.getAllByIndex<OutboxEntry>('outbox', 'path', path)).at(-1);
    if (pending && !inFlight.has(pending.seq!)) {
      await t.put('outbox', { ...pending, content: record });
      return;
    }
    const file = await t.get<FileEntry>('files', path);
    const entry: OutboxEntry = {
      path, recordType: type, recordId: record.id, op: 'put', content: record,
      baseSha: file?.blobSha ?? null, attempts: 0, lastError: null, createdAt: now(),
    };
    await t.put('outbox', entry);
  }

  async function writeRecords(items: SaveItem[], stamp: boolean, outbox: boolean) {
    const stores = unique(items.map((i) => STORE_OF[i.type]));
    if (!stores.length) return [];
    return write(outbox ? [...stores, 'files', 'outbox'] : stores, async (t) => {
      const out: Row[] = [];
      for (const { type, record, path } of items) {
        const store = STORE_OF[type];
        let rec = record as Row;
        if (stamp) {
          const old = await t.get<Row>(store, record.id);
          const ts = now();
          rec = { ...rec, schema: rec.schema ?? SCHEMA_VERSION, createdAt: old?.createdAt ?? rec.createdAt ?? ts, updatedAt: ts, updatedBy: deviceName() };
        }
        await t.put(store, toRow(store, rec));
        if (outbox) await enqueue(t, type, rec as { id: Id }, await pathOf(t, type, record.id, path));
        out.push(rec);
      }
      return out;
    });
  }

  return {
    /** All records of a store, sorted by id. */
    all: async <T>(store: StoreName) => (await read([store], (t) => t.getAll(store))).map(fromRow<T>),
    /** One record by id. */
    get: async <T>(store: StoreName, id: Id) => fromRow<T | undefined>(await read([store], (t) => t.get(store, id))),
    /** Records whose index equals value (e.g. orders by clientId, stock by classIds). */
    byIndex: async <T>(store: StoreName, index: string, value: Key) =>
      (await read([store], (t) => t.getAllByIndex(store, index, value))).map(fromRow<T>),

    /** User save: stamps the record, writes it and its outbox entry in one transaction; returns the saved record. */
    save: async <T extends { id: Id }>(type: RecordType, record: T, path?: string) =>
      (await writeRecords([{ type, record, path }], true, !demo()))[0] as unknown as Saved<T>,
    /** Several user saves in one transaction (e.g. void an order and its payments, D-006). */
    saveMany: async <T extends { id: Id }>(items: SaveItem<T>[]) =>
      (await writeRecords(items, true, !demo())) as unknown as Saved<T>[],
    /** Backup restore: writes records as they are (stamps kept) through the outbox. */
    importRecords: async (items: SaveItem[]) => void (await writeRecords(items, false, !demo())),
    /** Writes records as they are, never to the outbox (demo data). */
    seed: async (items: SaveItem[]) => void (await writeRecords(items, false, false)),

    /** Pending pushes in seq order. */
    outbox: () => read(['outbox'], (t) => t.getAll<OutboxEntry>('outbox')),
    /** Number of pending pushes. */
    outboxCount: async () => (await read(['outbox'], (t) => t.getAll('outbox'))).length,
    /** Marks an entry as being pushed, so later saves append instead of collapsing into it. */
    markInFlight: (seq: number) => void inFlight.add(seq),
    /** Records a failed push attempt. */
    markAttempt: async (seq: number, error: string | null) => {
      inFlight.delete(seq);
      await write(['outbox'], async (t) => {
        const e = await t.get<OutboxEntry>('outbox', seq);
        if (e) await t.put('outbox', { ...e, attempts: e.attempts + 1, lastError: error });
      });
    },
    /** Successful push: removes the entry and stores the new blob SHA in one transaction. */
    completePush: async (seq: number, path: string, blobSha: string, recordType: RecordType, recordId: Id) => {
      inFlight.delete(seq);
      await write(['outbox', 'files'], async (t) => {
        await t.delete('outbox', seq);
        await t.put('files', { path, blobSha, recordType, recordId } satisfies FileEntry);
      });
    },
    /** Drops every pending entry of a path (the remote version won the merge, §6.4). */
    dropOutboxFor: (path: string) =>
      write(['outbox'], async (t) => {
        for (const e of await t.getAllByIndex<OutboxEntry>('outbox', 'path', path)) await t.delete('outbox', e.seq!);
      }),

    /** Drops one entry (the one that lost a merge); later edits of the same path stay queued. */
    dropOutboxEntry: (seq: number) => {
      inFlight.delete(seq);
      return write(['outbox'], (t) => t.delete('outbox', seq)).then(() => undefined);
    },

    /** Known remote files by path. */
    files: async () => new Map((await read(['files'], (t) => t.getAll<FileEntry>('files'))).map((f) => [f.path, f])),
    /** Stores one files row. */
    putFile: (entry: FileEntry) => write(['files'], (t) => t.put('files', entry)).then(() => undefined),
    /** Pulled record: writes it and its files row in one transaction, no outbox. */
    applyRemote: (type: RecordType, record: { id: Id }, file: FileEntry) => {
      const store = STORE_OF[type];
      return write([store, 'files'], async (t) => {
        await t.put(store, toRow(store, record as Row));
        await t.put('files', file);
      });
    },
    /** Sync metadata value (lastSyncedCommitSha, lastSyncAt, schemaVersion). */
    getMeta: async <T = unknown>(key: string) => (await read(['meta'], (t) => t.get<{ value: T }>('meta', key)))?.value,
    /** Sets a sync metadata value. */
    setMeta: (key: string, value: unknown) => write(['meta'], (t) => t.put('meta', { key, value })).then(() => undefined),

    /** Empties every store (Disconnect, leaving demo). */
    clearAll: () => {
      inFlight.clear();
      return write(ALL, async (t) => {
        for (const n of ALL) await t.clear(n);
      });
    },
    /** Calls fn with the changed stores after every committed write; returns the unsubscribe function. */
    subscribe: (fn: (changed: TableName[]) => void) => {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
  };
}
