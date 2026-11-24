import { describe, expect, it } from 'vitest';
import {
  inputsSummary,
  parseCollapsed,
  pickerGroups,
  productTree,
  recipesMaking,
  recipesUsing,
  renameConflicts,
  toggleCollapsed,
} from '../../src/ui/screens/products/tree.ts';

const unit = (name: string, decimals: 0 | 1 | 2 | 3) => ({ name, decimals });
const p = (id: string, name: string, group = '', extra: Record<string, unknown> = {}) => ({
  id,
  name,
  group,
  archived: false,
  unit: unit('pcs', 0),
  customFields: [],
  customValues: {} as Record<string, string | number>,
  ...extra,
});

const bulk = p('bulk', 'Bulk', 'Honey/Rosemary', { unit: unit('kg', 3) });
const jar = p('jar', '500g Jar', 'Honey/Rosemary');
const empty = p('empty', 'Empty jar 500g', 'Packaging');
const lid = p('lid', 'Lid', 'Packaging');
const loose = p('loose', 'Candle');
const byId = new Map([bulk, jar, empty, lid, loose].map((c) => [c.id, c]));

const recipe = (id: string, name: string, inputs: [string, number][], outputs: [string, number][], archived = false) => ({
  id,
  name,
  archived,
  inputs: inputs.map(([classId, amount]) => ({ classId, amount })),
  outputs: outputs.map(([classId, amount]) => ({ classId, amount })),
});
const jarRecipe = recipe('r1', 'Fill 500g', [['empty', 1], ['lid', 1], ['bulk', 500]], [['jar', 1]]);
const old = recipe('r0', 'Old fill', [['bulk', 500]], [['jar', 1]], true);
const giftRecipe = recipe('r2', 'Box', [['jar', 2]], [['loose', 1]]);

describe('collapsed state', () => {
  it('parses a stored list and ignores junk', () => {
    expect(parseCollapsed('["Honey","Honey/Rosemary"]')).toEqual(['Honey', 'Honey/Rosemary']);
    expect(parseCollapsed(null)).toEqual([]);
    expect(parseCollapsed('{bad')).toEqual([]);
    expect(parseCollapsed('{"a":1}')).toEqual([]);
    expect(parseCollapsed('["a",3]')).toEqual(['a']);
  });
  it('toggles a path', () => {
    expect(toggleCollapsed(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleCollapsed(['a', 'b'], 'a')).toEqual(['b']);
  });
});

describe('productTree', () => {
  const all = [bulk, jar, empty, { ...lid, archived: true }, p('x', 'Lavender jar', 'Honey/Lavender', { customValues: { flower: 'lavender' } })];
  it('builds the tree from non-archived classes', () => {
    const t = productTree(all, '', '');
    expect(t.count).toBe(4);
    expect(t.groups.map((g) => g.path)).toEqual(['Honey', 'Packaging']);
    expect(t.groups[1].items.map((c) => c.id)).toEqual(['empty']);
  });
  it('filters first, so groups without a match disappear', () => {
    const t = productTree(all, 'flower', 'LAV');
    expect(t.groups.map((g) => g.path)).toEqual(['Honey']);
    expect(t.groups[0].groups.map((g) => g.path)).toEqual(['Honey/Lavender']);
  });
});

describe('inputsSummary', () => {
  it('lists amounts and full names, omitting pcs', () => {
    expect(inputsSummary(jarRecipe.inputs, byId)).toBe('1 Packaging - Empty jar 500g + 1 Packaging - Lid + 0.5 kg Honey - Rosemary - Bulk');
  });
  it('uses short names inside the context group', () => {
    expect(inputsSummary(jarRecipe.inputs, byId, 'Honey/Rosemary')).toBe('1 Packaging - Empty jar 500g + 1 Packaging - Lid + 0.5 kg Bulk');
  });
  it('marks unknown products', () => expect(inputsSummary([{ classId: 'zz', amount: 2 }], byId)).toBe('2 ?'));
});

describe('recipesMaking / recipesUsing', () => {
  const rs = [giftRecipe, old, jarRecipe];
  it('finds non-archived recipes that output the class', () => expect(recipesMaking(rs, 'jar').map((r) => r.id)).toEqual(['r1']));
  it('finds non-archived recipes that use the class', () => {
    expect(recipesUsing(rs, 'jar').map((r) => r.id)).toEqual(['r2']);
    expect(recipesUsing(rs, 'bulk').map((r) => r.id)).toEqual(['r1']);
  });
});

describe('pickerGroups', () => {
  it('puts top-level first, then groups by full path label, items by name', () => {
    const r = pickerGroups([lid, jar, loose, empty, bulk]);
    expect(r.map((g) => g.label)).toEqual(['', 'Honey - Rosemary', 'Packaging']);
    expect(r[1].items.map((c) => c.id)).toEqual(['jar', 'bulk']);
    expect(r[2].items.map((c) => c.id)).toEqual(['empty', 'lid']);
  });
});

describe('renameConflicts', () => {
  const all = [jar, p('j2', '500G JAR', 'Honey/Thyme'), p('j3', 'Bulk', 'Honey/Thyme', { archived: true })];
  it('names the products that would clash in the target group', () => {
    expect(renameConflicts(all, 'Honey/Thyme', 'Honey/Rosemary')).toEqual(['500G JAR']);
  });
  it('is empty when no clash', () => expect(renameConflicts(all, 'Honey/Thyme', 'Honey/Wild')).toEqual([]));
});
