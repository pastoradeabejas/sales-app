// Hash routes (spec §7, plus #/orders/:id/edit from §8.4). Pure: no DOM.

export type Tab = 'overview' | 'orders' | 'clients' | 'stock' | 'products';

const routes = [
  ['overview', 'overview', 'overview'],
  ['settings', 'settings', 'overview'],
  ['orders', 'orders', 'orders'],
  ['order-new', 'orders/new', 'orders'],
  ['order', 'orders/:id', 'orders'],
  ['order-edit', 'orders/:id/edit', 'orders'],
  ['clients', 'clients', 'clients'],
  ['client', 'clients/:id', 'clients'],
  ['stock', 'stock', 'stock'],
  ['stock-add', 'stock/add', 'stock'],
  ['stock-remove', 'stock/remove', 'stock'],
  ['stock-transform', 'stock/transform', 'stock'],
  ['stock-class', 'stock/:classId', 'stock'],
  ['products', 'products', 'products'],
  ['product', 'products/:classId', 'products'],
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
