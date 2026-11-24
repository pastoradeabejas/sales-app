// Grouped display helpers (D-015): full names, optgroups, collapsible tree rows, remembered collapse state.
import { fullName, normalizeGroup, type GroupNode } from '../../../core/groups.ts';

type Named = { name: string; group?: string };
const byFull = (a: Named, b: Named) => fullName(a).localeCompare(fullName(b), undefined, { sensitivity: 'base', numeric: true });

/** Full name of a live product, else the stored fallback, else "Unknown". */
export function liveName(byId: Map<string, Named>, id: string, fallback?: string): string {
  const c = byId.get(id);
  return c ? fullName(c) : (fallback ?? 'Unknown');
}

/** A copy sorted by full name. */
export function sortByFullName<T extends Named>(items: T[]): T[] {
  return [...items].sort(byFull);
}

/** Items per group path for <optgroup>: ungrouped first (path ''), then by path; items by full name. */
export function groupedOptions<T extends Named>(items: T[]): { path: string; items: T[] }[] {
  const m = new Map<string, T[]>();
  for (const i of sortByFullName(items)) {
    const k = normalizeGroup(i.group);
    m.set(k, [...(m.get(k) ?? []), i]);
  }
  return [...m].map(([path, list]) => ({ path, items: list })).sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: 'base' }));
}

type Store = Pick<Storage, 'getItem' | 'setItem'> | undefined;

/** Collapsed group paths from storage; empty when missing or unreadable. */
export function loadCollapsed(store: Store, key: string): Set<string> {
  try {
    const v = JSON.parse(store?.getItem(key) ?? '[]');
    return new Set(Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

export function saveCollapsed(store: Store, key: string, set: Set<string>): void {
  try {
    store?.setItem(key, JSON.stringify([...set]));
  } catch {
    // storage unavailable: the state just is not remembered
  }
}

export function toggleCollapsed(set: Set<string>, path: string): Set<string> {
  const next = new Set(set);
  if (!next.delete(path)) next.add(path);
  return next;
}

export type TreeRow<T> = { kind: 'group'; node: GroupNode<T>; depth: number; open: boolean } | { kind: 'item'; item: T; depth: number };

/**
 * Visible rows of the tree: a group header, then (when open) its subgroups and items.
 * A group holding a forced item (anywhere below) is always open. Root items come last, depth 0.
 */
export function flattenTree<T>(
  root: GroupNode<T>,
  opts: { collapsed: Set<string>; force: (item: T) => boolean; order?: (a: T, b: T) => number },
): TreeRow<T>[] {
  const forced = (n: GroupNode<T>): boolean => n.items.some(opts.force) || n.groups.some(forced);
  const rows: TreeRow<T>[] = [];
  const items = (n: GroupNode<T>) => (opts.order ? [...n.items].sort(opts.order) : n.items);
  const walk = (n: GroupNode<T>, depth: number) => {
    for (const g of n.groups) {
      const open = !opts.collapsed.has(g.path) || forced(g);
      rows.push({ kind: 'group', node: g, depth, open });
      if (open) walk(g, depth + 1);
    }
    for (const item of items(n)) rows.push({ kind: 'item', item, depth });
  };
  walk(root, 0);
  return rows;
}
