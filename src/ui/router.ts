// Hash routes (spec §7, plus #/orders/:id/edit from §8.4). Pure: no DOM.

export type Tab = 'overview' | 'orders' | 'expenses' | 'stock' | 'profit';

const routes = [
  ['overview', 'overview', 'overview'],
  ['settings', 'settings', 'overview'],
  ['orders', 'orders', 'orders'],
  ['order-new', 'orders/new', 'orders'],
  ['order', 'orders/:id', 'orders'],
  ['order-edit', 'orders/:id/edit', 'orders'],
  ['clients', 'clients', 'orders'],
  ['client', 'clients/:id', 'orders'],
  ['stock', 'stock', 'stock'],
  ['stock-add', 'stock/add', 'stock'],
  ['stock-remove', 'stock/remove', 'stock'],
  ['stock-transform', 'stock/transform', 'stock'],
  ['stock-class', 'stock/:classId', 'stock'],
  ['products', 'products', 'stock'],
  ['product', 'products/:classId', 'stock'],
  ['recipes', 'recipes', 'stock'],
  ['expense-items', 'expense-items', 'expenses'],
  ['purchases', 'purchases', 'expenses'],
  ['purchase-new', 'purchases/new', 'expenses'],
  ['purchase', 'purchases/:id', 'expenses'],
  ['purchase-edit', 'purchases/:id/edit', 'expenses'],
  ['suppliers', 'suppliers', 'expenses'],
  ['supplier', 'suppliers/:id', 'expenses'],
  ['profit', 'profit', 'profit'],
] as const satisfies readonly (readonly [string, string, Tab])[];

export type RouteName = (typeof routes)[number][0];
export type Route = { name: RouteName; params: Record<string, string> };

const fallback: Route = { name: 'overview', params: {} };

/** Parses `location.hash`. Fixed segments win over params (listed first). */
export function parseRoute(hash: string): Route {
  if (!hash.startsWith('#/')) return fallback;
  const parts = hash.slice(2).split('?')[0].split('/').filter(Boolean);
  for (const [name, pattern] of routes) {
    const segs = pattern.split('/');
    if (segs.length !== parts.length) continue;
    const params: Record<string, string> = {};
    const ok = segs.every((seg, i) => {
      if (!seg.startsWith(':')) return seg === parts[i];
      try {
        params[seg.slice(1)] = decodeURIComponent(parts[i]);
        return true;
      } catch {
        return false;
      }
    });
    if (ok) return { name, params };
  }
  return fallback;
}

export function tabOf(name: RouteName): Tab {
  return routes.find((r) => r[0] === name)![2];
}

/** Query parameters after `?` in the hash (e.g. `#/stock/transform?input=<classId>`). */
export function parseQuery(hash: string): Record<string, string> {
  const q = hash.indexOf('?');
  return q < 0 ? {} : Object.fromEntries(new URLSearchParams(hash.slice(q + 1)));
}

/** The two list screens (sides) of each two-sided tab; the first is the default. */
export const SIDES: Record<string, string[]> = {
  orders: ['orders', 'clients'],
  expenses: ['purchases', 'suppliers', 'expense-items'],
  stock: ['products', 'stock', 'recipes'],
};

export const SIDES_KEY = 'tabSides';

/** Hash of a tab's nav link: the remembered side if valid, else the first side. */
export function tabHref(tab: Tab, remembered: Record<string, string>): string {
  const sides = SIDES[tab];
  if (!sides) return `#/${tab}`;
  return `#/${sides.includes(remembered[tab]) ? remembered[tab] : sides[0]}`;
}

/** Reads the stored remembered sides, dropping invalid JSON and values. */
export function parseSides(raw: string | null): Record<string, string> {
  try {
    const v = JSON.parse(raw ?? '{}');
    if (!v || typeof v !== 'object') return {};
    return Object.fromEntries(Object.entries(v).filter(([tab, side]) => SIDES[tab]?.includes(side as string))) as Record<string, string>;
  } catch {
    return {};
  }
}
