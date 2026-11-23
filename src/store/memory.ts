// In-memory Backend with IndexedDB semantics (atomic, copied values, sorted keys); for tests and as a fallback.
import { SCHEMA, type Backend, type Key, type TableName, type Tx } from './backend.ts';

type Row = Record<string, unknown>;
type Table = Map<Key, Row>;

const byKey = (a: Key, b: Key) => (typeof a === typeof b ? (a < b ? -1 : a > b ? 1 : 0) : typeof a === 'number' ? -1 : 1);
const sorted = (t: Table) => [...t.entries()].sort(([a], [b]) => byKey(a, b)).map(([, row]) => structuredClone(row));

/** Creates an empty in-memory backend. */
export function memoryBackend(): Backend {
  const data = new Map<TableName, Table>(Object.keys(SCHEMA).map((n) => [n as TableName, new Map()]));
  const seqs = new Map<TableName, number>();
  let queue: Promise<unknown> = Promise.resolve();

  async function run<R>(tables: TableName[], mode: string, fn: (t: Tx) => Promise<R>): Promise<R> {
    const work = new Map(tables.map((n) => [n, new Map(data.get(n))]));
    const nextSeq = new Map(seqs);
    const table = (n: TableName, write = false) => {
      const t = work.get(n);
      if (!t) throw new Error(`store ${n} is not in this transaction`);
      if (write && mode !== 'readwrite') throw new Error('readonly transaction');
      return t;
    };
    const t: Tx = {
      get: async <T>(n: TableName, key: Key) => {
        const row = table(n).get(key);
        return row && (structuredClone(row) as T);
      },
      getAll: async <T>(n: TableName) => sorted(table(n)) as T[],
      getAllByIndex: async <T>(n: TableName, index: string, value: Key) => {
        const def = SCHEMA[n].indexes.find((i) => i.name === index);
        if (!def) throw new Error(`no index ${index} on ${n}`);
        const hit = (v: unknown) => (def.multiEntry && Array.isArray(v) ? v.includes(value) : v === value);
        return sorted(table(n)).filter((row) => hit(row[def.keyPath])) as T[];
      },
      put: async (n: TableName, value: object) => {
        const tbl = table(n, true);
        const { keyPath, autoIncrement } = SCHEMA[n];
        const row = structuredClone(value) as Row;
        if (autoIncrement && row[keyPath] === undefined) {
          const seq = (nextSeq.get(n) ?? 0) + 1;
          nextSeq.set(n, seq);
          row[keyPath] = seq;
        }
        tbl.set(row[keyPath] as Key, row);
        return row[keyPath] as Key;
      },
      delete: async (n: TableName, key: Key) => void table(n, true).delete(key),
      clear: async (n: TableName) => table(n, true).clear(),
    };
    const result = await fn(t);
    if (mode === 'readwrite') {
      for (const [n, tbl] of work) data.set(n, tbl);
      for (const [n, s] of nextSeq) seqs.set(n, s);
    }
    return result;
  }

  return {
    tx(tables, mode, fn) {
      const p = queue.then(() => run(tables, mode, fn));
      queue = p.catch(() => undefined);
      return p;
    },
  };
}
