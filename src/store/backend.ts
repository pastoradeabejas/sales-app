// Storage backend contract and the IndexedDB schema (spec §5), shared by idb.ts and memory.ts.

/** Object stores holding records. */
export type StoreName = 'products' | 'clients' | 'orders' | 'payments' | 'stock' | 'recipes';
/** Every object store, including sync bookkeeping. */
export type TableName = StoreName | 'files' | 'outbox' | 'meta';
export type Key = string | number;
export type Mode = 'readonly' | 'readwrite';

/** Operations available inside one transaction. */
export interface Tx {
  get<T>(table: TableName, key: Key): Promise<T | undefined>;
  getAll<T>(table: TableName): Promise<T[]>;
  getAllByIndex<T>(table: TableName, index: string, value: Key): Promise<T[]>;
  /** Returns the row's key (the new seq for the outbox). */
  put(table: TableName, value: object): Promise<Key>;
  delete(table: TableName, key: Key): Promise<void>;
  clear(table: TableName): Promise<void>;
}

/** Runs `fn` in one atomic transaction: all of its writes commit, or none (when fn throws). */
export interface Backend {
  tx<R>(tables: TableName[], mode: Mode, fn: (t: Tx) => Promise<R>): Promise<R>;
}

export interface IndexDef {
  name: string;
  keyPath: string;
  multiEntry?: boolean;
}

export interface TableDef {
  keyPath: string;
  autoIncrement?: boolean;
  indexes: IndexDef[];
}

/** Database name and version (spec §5). */
export const DB_NAME = 'sales-bookkeeping';
export const DB_VERSION = 1;

const idx = (...names: string[]): IndexDef[] => names.map((name) => ({ name, keyPath: name }));

/** Object stores and indexes (§5; recordId/path indexes added for outbox collapsing and path lookup). */
export const SCHEMA: Record<TableName, TableDef> = {
  products: { keyPath: 'id', indexes: [] },
  clients: { keyPath: 'id', indexes: [] },
  orders: { keyPath: 'id', indexes: idx('clientId', 'date') },
  payments: { keyPath: 'id', indexes: idx('orderId', 'clientId', 'date') },
  stock: { keyPath: 'id', indexes: [...idx('classId', 'date'), { name: 'classIds', keyPath: 'classIds', multiEntry: true }] },
  recipes: { keyPath: 'id', indexes: [] },
  files: { keyPath: 'path', indexes: idx('recordId') },
  outbox: { keyPath: 'seq', autoIncrement: true, indexes: idx('path', 'recordId') },
  meta: { keyPath: 'key', indexes: [] },
};
