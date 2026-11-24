// Product groups (D-015): a product's `group` is a "/"-separated path such as
// "Honey/Rosemary"; "" is the top level. Pure helpers for names and the tree.

type Named = { name: string; group?: string };

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });

/** Trimmed path without empty segments: " Honey / Rosemary " → "Honey/Rosemary". */
export function normalizeGroup(path: string | undefined): string {
  return (path ?? '')
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean)
    .join('/');
}

/** "Honey - Rosemary - 500g Jar": the name shown wherever products are mixed. */
export function fullName(p: Named): string {
  return [...normalizeGroup(p.group).split('/').filter(Boolean), p.name].join(' - ');
}

export interface GroupNode<T> {
  name: string;
  path: string;
  groups: GroupNode<T>[];
  items: T[];
  /** Products in this group and all its subgroups. */
  count: number;
}

/** Nested tree of groups; groups and items sorted by name. */
export function buildTree<T extends Named>(items: T[]): GroupNode<T> {
  const root: GroupNode<T> = { name: '', path: '', groups: [], items: [], count: 0 };
  for (const item of items) {
    let node = root;
    node.count++;
    for (const seg of normalizeGroup(item.group).split('/').filter(Boolean)) {
      let child = node.groups.find((g) => g.name === seg);
      if (!child) {
        child = { name: seg, path: node.path ? `${node.path}/${seg}` : seg, groups: [], items: [], count: 0 };
        node.groups.push(child);
      }
      node = child;
      node.count++;
    }
    node.items.push(item);
  }
  const sort = (n: GroupNode<T>) => {
    n.groups.sort((a, b) => byName(a.name, b.name));
    n.items.sort((a, b) => byName(a.name, b.name));
    n.groups.forEach(sort);
  };
  sort(root);
  return root;
}

/** Every group path in use, parents included, sorted (for the group picker). */
export function allGroups(items: Named[]): string[] {
  const paths = new Set<string>();
  for (const i of items) {
    const segs = normalizeGroup(i.group).split('/').filter(Boolean);
    segs.forEach((_, k) => paths.add(segs.slice(0, k + 1).join('/')));
  }
  return [...paths].sort(byName);
}

/** A product's group after renaming/moving group `from` to `to` (subgroups follow). */
export function renameGroup(path: string, from: string, to: string): string {
  const p = normalizeGroup(path);
  const f = normalizeGroup(from);
  if (p !== f && !p.startsWith(`${f}/`)) return p;
  return normalizeGroup(`${normalizeGroup(to)}/${p.slice(f.length)}`);
}
