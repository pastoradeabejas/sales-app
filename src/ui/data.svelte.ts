// App data layer: all records in reactive state, derived lookups, and every
// user action (validate in core, save through the store with its outbox).
import { averageCostOnDay } from '../core/costs.ts';
import { allocateAll, type ClientBalance } from '../core/payments.ts';
import { newId } from '../core/ids.ts';
import { orderTotal } from '../core/orders.ts';
import { purchaseTotal } from '../core/purchases.ts';
import { recordPath } from '../core/paths.ts';
import { stockSnapshot, type StockState } from '../core/stock.ts';
import type {
  Client,
  Id,
  IsoDate,
  Order,
  Payment,
  PaymentMethod,
  ProductClass,
  Purchase,
  Recipe,
  RecordType,
  StockEvent,
  Supplier,
  WorkLevel,
} from '../core/types.ts';
import { loadDemo } from '../store/demo.ts';
import { idbBackend } from '../store/idb.ts';
import { memoryBackend } from '../store/memory.ts';
import { requestPersistence } from '../store/persist.ts';
import { loadSettings, saveSettings, type Settings } from '../store/settings.ts';
import { createStore, STORE_OF, type SaveItem, type Store, type StoreName } from '../store/store.ts';
import { showToast } from './toast.svelte.ts';

/** Local calendar date YYYY-MM-DD. */
export function localDate(d = new Date()): IsoDate {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const app = $state({
  ready: false,
  error: '' as string,
  settings: loadSettings(localStorage) as Settings,
  products: [] as ProductClass[],
  clients: [] as Client[],
  orders: [] as Order[],
  payments: [] as Payment[],
  stock: [] as StockEvent[],
  recipes: [] as Recipe[],
  suppliers: [] as Supplier[],
  purchases: [] as Purchase[],
  levels: [] as WorkLevel[],
  outboxCount: 0,
});

const classesById = $derived(new Map(app.products.map((c) => [c.id, c])));
const clientsById = $derived(new Map(app.clients.map((c) => [c.id, c])));
const ordersById = $derived(new Map(app.orders.map((o) => [o.id, o])));
const suppliersById = $derived(new Map(app.suppliers.map((s) => [s.id, s])));
const levelsById = $derived(new Map(app.levels.map((l) => [l.id, l])));
const purchasesById = $derived(new Map(app.purchases.map((p) => [p.id, p])));
const balances = $derived(allocateAll(app.orders, app.payments));
const snapshot = $derived(stockSnapshot(app.products, app.orders, app.stock, app.purchases));

/** Derived views, recomputed only when their records change. */
export const view = {
  get classesById(): Map<Id, ProductClass> {
    return classesById;
  },
  get clientsById(): Map<Id, Client> {
    return clientsById;
  },
  get ordersById(): Map<Id, Order> {
    return ordersById;
  },
  get suppliersById(): Map<Id, Supplier> {
    return suppliersById;
  },
  get levelsById(): Map<Id, WorkLevel> {
    return levelsById;
  },
  get purchasesById(): Map<Id, Purchase> {
    return purchasesById;
  },
  get balances(): Map<Id, ClientBalance> {
    return balances;
  },
  get snapshot(): Map<Id, StockState> {
    return snapshot;
  },
};

/** A class's average cost at the end of `date` (cost snapshot of a sale or transform that day); null when unknown. */
export function avgCostOnDay(classId: Id, date: IsoDate): number | null {
  const c = classesById.get(classId);
  return c ? averageCostOnDay(c, date, app.orders, app.stock, classesById, app.purchases) : null;
}

let store: Store;

/** The store (sync uses it). */
export function getStore(): Store {
  return store;
}

async function reload(stores: StoreName[]) {
  const loaded = await Promise.all(stores.map((s) => store.all(s)));
  stores.forEach((s, i) => ((app as Record<StoreName, unknown>)[s] = loaded[i]));
}

const RECORD_STORES: StoreName[] = ['products', 'clients', 'orders', 'payments', 'stock', 'recipes', 'suppliers', 'purchases', 'levels'];

/** Opens IndexedDB (memory if unavailable) and loads every record. */
export async function initData() {
  let backend;
  try {
    backend = idbBackend();
  } catch {
    backend = memoryBackend();
    app.error = 'This browser cannot store data offline; changes are kept only until you close the app.';
  }
  store = createStore(backend, {
    deviceName: () => app.settings.deviceName || 'This device',
    demo: () => app.settings.demoMode,
  });
  store.subscribe(async (changed) => {
    const stores = RECORD_STORES.filter((s) => changed.includes(s));
    if (stores.length) await reload(stores);
    if (changed.includes('outbox')) app.outboxCount = await store.outboxCount();
  });
  await reload(RECORD_STORES);
  app.outboxCount = await store.outboxCount();
  app.ready = true;
}

/** Saves device settings (localStorage). */
export function updateSettings(patch: Partial<Settings>) {
  app.settings = saveSettings(localStorage, patch);
}

/** Demo mode (§2.1): sample data, no sync. Replaces local data. */
export async function startDemo() {
  updateSettings({ demoMode: true, deviceName: app.settings.deviceName || 'Demo' });
  await store.clearAll();
  await loadDemo(store, localDate(), new Date().toISOString());
  void requestPersistence();
}

/** Leaves demo mode or disconnects: clears local data and the token (§8.1). */
export async function clearDevice() {
  await store.clearAll();
  updateSettings({ demoMode: false, token: '', dataRepo: '' });
}

// ---------- saving ----------

function item<T extends { id: Id; date?: string }>(type: RecordType, record: T): SaveItem {
  return { type, record, path: recordPath(type, record) };
}

async function save<T extends { id: Id; date?: string }>(type: RecordType, record: T): Promise<T> {
  return (await store.save(type, record, recordPath(type, record))) as unknown as T;
}

/** New record base fields; the store stamps createdAt/updatedAt. */
function fresh() {
  return { id: newId(), schema: 1, createdAt: '', updatedAt: '', updatedBy: '' };
}

/** Whether a store has any record (e.g. for empty states). */
export function isEmpty(s: StoreName): boolean {
  return (app as Record<StoreName, unknown[]>)[s].length === 0;
}

// Catalogue (S4)
export function newClassDraft(): ProductClass {
  return {
    ...fresh(),
    name: '',
    group: '',
    unit: { name: 'pcs', decimals: 0 },
    lowStockThreshold: null,
    trackStock: true,
    sellable: true,
    customFields: [],
    customValues: {},
    notes: '',
    archived: false,
    variants: [],
  };
}

/** Unit decimals are locked once a class has orders or stock events (§3.2). */
export function decimalsLocked(classId: Id): boolean {
  return (
    app.orders.some((o) => o.lines.some((l) => l.classId === classId)) ||
    app.stock.some((e) =>
      e.type === 'transform' ? [...e.inputs, ...e.outputs].some((s) => s.classId === classId) : e.classId === classId,
    ) ||
    app.purchases.some((p) => p.lines.some((l) => l.classId === classId))
  );
}

export const saveClass = (cls: ProductClass) => save('product', $state.snapshot(cls) as ProductClass);

/** Stamps a variant change inside its class (variants merge per variant, §6.4). */
export function stampVariant<T extends { updatedAt: string; updatedBy: string; createdAt: string }>(v: T): T {
  const ts = new Date().toISOString();
  return { ...v, createdAt: v.createdAt || ts, updatedAt: ts, updatedBy: app.settings.deviceName || 'This device' };
}

// Clients (S5)
export function newClientDraft(name = ''): Client {
  return { ...fresh(), name, phone: '', notes: '', tags: [], archived: false };
}

export const saveClient = (c: Client) => save('client', { ...$state.snapshot(c), name: c.name.trim() } as Client);

// Orders and payments (S6)
export interface PaymentDraft {
  amount: number;
  method: PaymentMethod;
}

/** Saves an order (new or edited) and an optional linked payment in one transaction. */
export async function saveOrder(order: Order, payment?: PaymentDraft): Promise<Order> {
  const client = clientsById.get(order.clientId);
  const rec: Order = {
    ...($state.snapshot(order) as Order),
    clientName: ordersById.get(order.id)?.clientId === order.clientId ? order.clientName : (client?.name ?? order.clientName),
    total: orderTotal(order.lines),
  };
  const items = [item('order', rec)];
  let pay: Payment | null = null;
  if (payment && payment.amount > 0) {
    pay = newPayment({ clientId: rec.clientId, orderId: rec.id, amount: payment.amount, method: payment.method, date: rec.date });
    items.push(item('payment', pay));
    updateSettings({ lastPaymentMethod: payment.method });
  }
  await store.saveMany(items);
  return rec;
}

export function newPayment(p: { clientId: Id; orderId: Id | null; amount: number; method: PaymentMethod; date: IsoDate; note?: string }): Payment {
  return { ...fresh(), date: p.date, clientId: p.clientId, orderId: p.orderId, amount: p.amount, method: p.method, note: p.note ?? '', voided: false };
}

/** Records a payment (receive from client, add on order). */
export async function addPayment(p: Payment) {
  await save('payment', p);
  updateSettings({ lastPaymentMethod: p.method });
}

/** Voids an order and every payment linked to it (D-006). */
export async function voidOrder(id: Id, reason: string) {
  const order = ordersById.get(id);
  if (!order) return;
  const linked = app.payments.filter((p) => p.orderId === id && !p.voided);
  await store.saveMany([
    item('order', { ...$state.snapshot(order), voided: true, voidReason: reason || null }),
    ...linked.map((p) => item('payment', { ...$state.snapshot(p), voided: true })),
  ]);
}

/** Undo of a just-created order: voids it and its payment (§8.4). */
export function undoToast(message: string, orderId: Id) {
  showToast(message, { label: 'Undo', run: () => voidOrder(orderId, 'Undone') });
}

export async function voidPayment(id: Id) {
  const p = app.payments.find((x) => x.id === id);
  if (p) await save('payment', { ...$state.snapshot(p), voided: true });
}

// Stock (S8)
export const saveStockEvent = (e: StockEvent) => save('stock', $state.snapshot(e) as StockEvent);

export async function voidStockEvent(id: Id) {
  const e = app.stock.find((x) => x.id === id);
  if (e) await save('stock', { ...$state.snapshot(e), voided: true });
}

export const saveRecipe = (r: Recipe) => save('recipe', $state.snapshot(r) as Recipe);

// Suppliers, purchases and work levels (S14)
export function newSupplierDraft(name = ''): Supplier {
  return { ...fresh(), name, phone: '', notes: '', archived: false };
}

export const saveSupplier = (s: Supplier) => save('supplier', { ...$state.snapshot(s), name: s.name.trim() } as Supplier);

export function newPurchaseDraft(date: IsoDate): Purchase {
  return {
    ...fresh(), date, supplierId: null, supplierName: '', lines: [], total: 0,
    method: app.settings.lastPaymentMethod ?? 'cash', note: '', voided: false,
  };
}

/** Saves a purchase: recomputes the total and snapshots the supplier name. */
export async function savePurchase(p: Purchase): Promise<Purchase> {
  const rec: Purchase = {
    ...($state.snapshot(p) as Purchase),
    supplierName: p.supplierId ? (suppliersById.get(p.supplierId)?.name ?? p.supplierName) : '',
    total: purchaseTotal(p.lines),
  };
  const saved = await save('purchase', rec);
  updateSettings({ lastPaymentMethod: rec.method });
  return saved;
}

export async function voidPurchase(id: Id) {
  const p = purchasesById.get(id);
  if (p) await save('purchase', { ...$state.snapshot(p), voided: true });
}

/** Undo of a just-created purchase. */
export function undoPurchaseToast(message: string, purchaseId: Id) {
  showToast(message, { label: 'Undo', run: () => voidPurchase(purchaseId) });
}

export function newLevelDraft(): WorkLevel {
  return { ...fresh(), name: '', hourlyRate: 0, archived: false };
}

export const saveLevel = (l: WorkLevel) => save('level', { ...$state.snapshot(l), name: l.name.trim() } as WorkLevel);

/** Moves one client's orders and payments to another and archives it (§9). */
export async function mergeClients(keepId: Id, dupId: Id) {
  const keep = clientsById.get(keepId);
  const dup = clientsById.get(dupId);
  if (!keep || !dup) return;
  const items: SaveItem[] = [
    ...app.orders.filter((o) => o.clientId === dupId).map((o) => item('order', { ...$state.snapshot(o), clientId: keepId, clientName: keep.name })),
    ...app.payments.filter((p) => p.clientId === dupId).map((p) => item('payment', { ...$state.snapshot(p), clientId: keepId })),
    item('client', { ...$state.snapshot(dup), archived: true }),
  ];
  await store.saveMany(items);
}

/** Writes a backup restore plan through the outbox (records keep their stamps). */
export async function importBackup(plan: { type: RecordType; record: { id: Id; date?: string } }[]) {
  await store.importRecords(plan.map((p) => item(p.type, p.record)));
}

/** Store name of a record type (for generic screens). */
export const storeOf = (t: RecordType) => STORE_OF[t];

/** New ids for lines and drafts. */
export { newId, fresh as freshRecord };
