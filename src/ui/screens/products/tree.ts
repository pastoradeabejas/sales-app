// Product groups in the UI (D-015): tree with filter, collapse state, recipe links.
import { normalizeName } from '../../../core/clients.ts';
import { buildTree, fullName, normalizeGroup, renameGroup, type GroupNode } from '../../../core/groups.ts';
import { formatAmount } from '../../../core/quantity.ts';
import type { ClassAmount, Decimals } from '../../../core/types.ts';
import { filterByCustomField } from './customFilter.ts';

type Cls = { id: string; name: string; group?: string; archived: boolean };
type Unit = { name: string; decimals: Decimals };
type RecipeLike = { name: string; archived: boolean; inputs: ClassAmount[]; outputs: ClassAmount[] };

export const COLLAPSED_KEY = 'productsCollapsed';
export const VIEW_KEY = 'productsView';

/** Products view kept per device (D-017): 'table' or, by default, 'cards'. */
export const parseView = (raw: string | null): 'cards' | 'table' => (raw === 'table' ? 'table' : 'cards');

/** Collapsed group paths from localStorage text; anything malformed → []. */
export function parseCollapsed(raw: string | null): string[] {
  try {
    const v: unknown = JSON.parse(raw ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export const toggleCollapsed = (list: string[], path: string): string[] =>
  list.includes(path) ? list.filter((p) => p !== path) : [...list, path];

/** Non-archived classes, custom-field filter first, then the tree (empty groups never appear). */
export function productTree<T extends Cls & { customValues: Record<string, string | number> }>(
  classes: T[],
  key: string,
  text: string,
): GroupNode<T> {
  return buildTree(filterByCustomField(classes.filter((c) => !c.archived), key, text));
}

/** "1 Empty jar 500g + 0.5 kg Bulk": full names, short ones inside `contextGroup`; pcs not written. */
export function inputsSummary(rows: ClassAmount[], byId: Map<string, Cls & { unit: Unit }>, contextGroup?: string): string {
  const ctx = contextGroup === undefined ? undefined : normalizeGroup(contextGroup);
  return rows
    .map((r) => {
      const c = byId.get(r.classId);
      if (!c) return `${r.amount} ?`;
      const name = ctx !== undefined && normalizeGroup(c.group) === ctx ? c.name : fullName(c);
      return `${formatAmount(r.amount, c.unit.decimals, c.unit.name === 'pcs' ? undefined : c.unit.name)} ${name}`;
    })
    .join(' + ');
}

const active = <R extends RecipeLike>(rs: R[], pick: (r: R) => ClassAmount[], classId: string): R[] =>
  rs.filter((r) => !r.archived && pick(r).some((x) => x.classId === classId)).sort((a, b) => a.name.localeCompare(b.name));

/** Non-archived recipes that make the class. */
export const recipesMaking = <R extends RecipeLike>(rs: R[], classId: string) => active(rs, (r) => r.outputs, classId);
/** Non-archived recipes that use the class as an input. */
export const recipesUsing = <R extends RecipeLike>(rs: R[], classId: string) => active(rs, (r) => r.inputs, classId);

const cmp = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });

/** Options for <optgroup>: top level first (label ''), then groups by "Honey - Rosemary", items by name. */
export function pickerGroups<T extends Cls>(classes: T[]): { label: string; items: T[] }[] {
  const m = new Map<string, T[]>();
  for (const c of classes) {
    const g = normalizeGroup(c.group);
    m.set(g, [...(m.get(g) ?? []), c]);
  }
  return [...m]
    .map(([g, items]) => ({ label: g.split('/').join(' - '), items: items.sort((a, b) => cmp(a.name, b.name)) }))
    .sort((a, b) => (a.label === '' ? -1 : b.label === '' ? 1 : cmp(a.label, b.label)));
}

/** Names of moved non-archived products that would clash with a product already in their new group. */
export function renameConflicts(classes: Cls[], from: string, to: string): string[] {
  const live = classes.filter((c) => !c.archived);
  const moved = live.filter((c) => renameGroup(c.group ?? '', from, to) !== normalizeGroup(c.group));
  const key = (g: string, n: string) => `${g}\u0000${normalizeName(n)}`;
  const staying = new Set(live.filter((c) => !moved.includes(c)).map((c) => key(normalizeGroup(c.group), c.name)));
  return moved.filter((c) => staying.has(key(renameGroup(c.group ?? '', from, to), c.name))).map((c) => c.name);
}
