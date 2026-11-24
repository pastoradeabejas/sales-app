// Thin Backend over the browser's IndexedDB (spec §5). Not unit-tested: Node has no IndexedDB.
import { DB_NAME, DB_VERSION, SCHEMA, type Backend, type TableName, type Tx } from './backend.ts';

const request = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

function open(factory: IDBFactory, onClosed: () => void): Promise<IDBDatabase> {
  const r = factory.open(DB_NAME, DB_VERSION);
  r.onupgradeneeded = () => {
    for (const [name, def] of Object.entries(SCHEMA)) {
      if (r.result.objectStoreNames.contains(name)) continue;
      const os = r.result.createObjectStore(name, { keyPath: def.keyPath, autoIncrement: def.autoIncrement });
      for (const i of def.indexes) os.createIndex(i.name, i.keyPath, { multiEntry: i.multiEntry });
    }
  };
  return request(r).then((db) => {
    // Another tab upgrades the database: close, and open it again on the next transaction.
    db.onversionchange = () => {
      db.close();
      onClosed();
    };
    return db;
  });
}

/** Creates the IndexedDB backend; the database opens on first use. Only IDB requests may be awaited inside fn. */
export function idbBackend(factory: IDBFactory = indexedDB): Backend {
  let db: Promise<IDBDatabase> | undefined;
  return {
    async tx(tables, mode, fn) {
      const x = (await (db ??= open(factory, () => (db = undefined)))).transaction(tables, mode);
      const done = new Promise<void>((resolve, reject) => {
        x.oncomplete = () => resolve();
        x.onabort = () => reject(x.error ?? new Error('transaction aborted'));
      });
      const os = (n: TableName) => x.objectStore(n);
      const t: Tx = {
        get: (n, key) => request(os(n).get(key)),
        getAll: (n) => request(os(n).getAll()),
        getAllByIndex: (n, index, value) => request(os(n).index(index).getAll(value)),
        put: (n, value) => request(os(n).put(value)) as Promise<string | number>,
        delete: (n, key) => request(os(n).delete(key)),
        clear: (n) => request(os(n).clear()),
      };
      try {
        const result = await fn(t);
        await done;
        return result;
      } catch (e) {
        done.catch(() => undefined);
        try {
          x.abort();
        } catch {
          // already finished or aborted
        }
        throw e;
      }
    },
  };
}
