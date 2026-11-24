import { describe, expect, it } from 'vitest';
import { allGroups, buildTree, fullName, normalizeGroup, renameGroup } from '../../src/core/groups.ts';

const p = (name: string, group = '') => ({ name, group });

describe('normalizeGroup', () => {
  it('trims segments and drops empty ones', () => {
    expect(normalizeGroup(' Honey / Rosemary ')).toBe('Honey/Rosemary');
    expect(normalizeGroup('/Honey//Flower/')).toBe('Honey/Flower');
    expect(normalizeGroup('')).toBe('');
    expect(normalizeGroup(undefined)).toBe('');
  });
});

describe('fullName', () => {
  it('joins the group path and the name', () => {
    expect(fullName(p('500g Jar', 'Honey/Rosemary'))).toBe('Honey - Rosemary - 500g Jar');
    expect(fullName(p('Gift box'))).toBe('Gift box');
    expect(fullName({ name: 'Old record' })).toBe('Old record');
  });
});

describe('buildTree', () => {
  it('nests groups and sorts groups and items by name', () => {
    const tree = buildTree([
      p('500g Jar', 'Honey/Rosemary'),
      p('Bulk', 'Honey/Rosemary'),
      p('1kg Jar', 'Honey/Flower'),
      p('Gift box'),
      p('Christmas box', 'Gifts'),
    ]);
    expect(tree.items.map((i) => i.name)).toEqual(['Gift box']);
    expect(tree.groups.map((g) => g.name)).toEqual(['Gifts', 'Honey']);
    const honey = tree.groups[1];
    expect(honey.path).toBe('Honey');
    expect(honey.groups.map((g) => g.path)).toEqual(['Honey/Flower', 'Honey/Rosemary']);
    expect(honey.groups[1].items.map((i) => i.name)).toEqual(['500g Jar', 'Bulk']);
    expect(honey.count).toBe(3);
  });
});

describe('allGroups', () => {
  it('lists every group path including parents', () => {
    expect(allGroups([p('a', 'Honey/Rosemary'), p('b', 'Gifts'), p('c')])).toEqual(['Gifts', 'Honey', 'Honey/Rosemary']);
  });
});

describe('renameGroup', () => {
  it('renames or moves a group and its subgroups', () => {
    expect(renameGroup('Honey/Rosemary', 'Honey', 'Miel')).toBe('Miel/Rosemary');
    expect(renameGroup('Honey', 'Honey', 'Food/Honey')).toBe('Food/Honey');
    expect(renameGroup('Honeycombs', 'Honey', 'Miel')).toBe('Honeycombs');
    expect(renameGroup('Honey/Flower', 'Honey/Flower', '')).toBe('');
  });
});
