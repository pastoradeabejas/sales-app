import { describe, expect, it } from 'vitest';
import { buildTree } from '../../src/core/groups.ts';
import {
  flattenTree,
  groupedOptions,
  liveName,
  loadCollapsed,
  saveCollapsed,
  sortByFullName,
  toggleCollapsed,
} from '../../src/ui/screens/stock/grouping.ts';

const p = (id: string, name: string, group?: string) => ({ id, name, group });

describe('liveName / sortByFullName', () => {
  const byId = new Map([['a', p('a', '500g Jar', 'Honey/Rosemary')], ['b', p('b', 'Bag')]]);
  it('uses the live full name, else the fallback', () => {
    expect(liveName(byId, 'a', 'old')).toBe('Honey - Rosemary - 500g Jar');
    expect(liveName(byId, 'b', 'old')).toBe('Bag');
    expect(liveName(byId, 'x', 'old')).toBe('old');
    expect(liveName(byId, 'x')).toBe('Unknown');
  });
  it('sorts by full name', () => {
    const l = [p('1', 'Z'), p('2', 'Jar', 'Honey/Acacia'), p('3', 'Jar', 'Honey/Rosemary')];
    expect(sortByFullName(l).map((x) => x.id)).toEqual(['2', '3', '1']);
  });
});

describe('groupedOptions', () => {
  it('lists ungrouped first, then one entry per group path', () => {
    const l = [p('1', 'Jar', 'Honey/Rosemary'), p('2', 'Bag'), p('3', 'Jar', 'Honey/Acacia'), p('4', 'Lid', 'Honey/Rosemary')];
    const g = groupedOptions(l);
    expect(g.map((x) => x.path)).toEqual(['', 'Honey/Acacia', 'Honey/Rosemary']);
    expect(g[2].items.map((x) => x.id)).toEqual(['1', '4']);
  });
});

describe('collapse state', () => {
  const store = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };
  it('round trips and survives garbage or missing storage', () => {
    const s = store();
    expect([...loadCollapsed(s, 'k')]).toEqual([]);
    saveCollapsed(s, 'k', new Set(['A', 'A/B']));
    expect([...loadCollapsed(s, 'k')]).toEqual(['A', 'A/B']);
    s.setItem('k', '{bad');
    expect([...loadCollapsed(s, 'k')]).toEqual([]);
    expect([...loadCollapsed(undefined, 'k')]).toEqual([]);
    expect(() => saveCollapsed(undefined, 'k', new Set())).not.toThrow();
  });
  it('toggles without mutating', () => {
    const a = new Set(['A']);
    expect([...toggleCollapsed(a, 'B')].sort()).toEqual(['A', 'B']);
    expect([...toggleCollapsed(a, 'A')]).toEqual([]);
    expect([...a]).toEqual(['A']);
  });
});

describe('flattenTree', () => {
  const items = [p('1', 'Jar', 'Honey/Rosemary'), p('2', 'Bag'), p('3', 'Jar', 'Honey/Acacia'), p('4', 'Box', 'Honey')];
  const tree = buildTree(items);
  const rows = (c: string[], force: (i: { id: string }) => boolean = () => false) =>
    flattenTree(tree, { collapsed: new Set(c), force }).map((r) => (r.kind === 'group' ? `G:${r.node.path}${r.open ? '' : '+'}` : `I:${r.item.id}`));

  it('lists subgroups before items, depth-first', () => {
    expect(rows([])).toEqual(['G:Honey', 'G:Honey/Acacia', 'I:3', 'G:Honey/Rosemary', 'I:1', 'I:4', 'I:2']);
  });
  it('hides the content of collapsed groups', () => {
    expect(rows(['Honey/Acacia'])).toEqual(['G:Honey', 'G:Honey/Acacia+', 'G:Honey/Rosemary', 'I:1', 'I:4', 'I:2']);
    expect(rows(['Honey'])).toEqual(['G:Honey+', 'I:2']);
  });
  it('forces open every group on the path of a forced item', () => {
    expect(rows(['Honey', 'Honey/Rosemary'], (i) => i.id === '1')).toEqual(['G:Honey', 'G:Honey/Acacia', 'I:3', 'G:Honey/Rosemary', 'I:1', 'I:4', 'I:2']);
  });
  it('keeps a custom item order inside a group', () => {
    const t = buildTree([p('1', 'A', 'G'), p('2', 'B', 'G'), p('3', 'C', 'G')]);
    const order = ['3', '1', '2'];
    const r = flattenTree(t, { collapsed: new Set(), force: () => false, order: (a, b) => order.indexOf(a.id) - order.indexOf(b.id) });
    expect(r.flatMap((x) => (x.kind === 'item' ? [x.item.id] : []))).toEqual(['3', '1', '2']);
  });
  it('products without a group stay a plain list', () => {
    const t = buildTree([p('1', 'B'), p('2', 'A')]);
    expect(flattenTree(t, { collapsed: new Set(), force: () => false }).map((r) => r.kind)).toEqual(['item', 'item']);
  });
});

describe('labels with groups', () => {
  const cls = (id: string, name: string, group?: string) =>
    ({ id, name, group, unit: { name: id === 'a' ? 'kg' : 'jar', decimals: id === 'a' ? 1 : 0 } }) as unknown as import('../../src/core/types.ts').ProductClass;
  const map = new Map([['a', cls('a', 'Bulk', 'Honey/Rosemary')], ['b', cls('b', '500g Jar', 'Honey/Rosemary')], ['c', cls('c', 'Bag')]]);
  it('transform summary uses full names; ungrouped stay plain', async () => {
    const { transformSummary } = await import('../../src/ui/screens/stock/logic.ts');
    expect(transformSummary([{ classId: 'a', amount: 5 }], [{ classId: 'b', amount: 1 }], map)).toBe('Honey - Rosemary - Bulk −0.5 kg → Honey - Rosemary - 500g Jar +1 jar');
    expect(transformSummary([{ classId: 'c', amount: 1 }], [], map)).toContain('Bag ');
  });
});
