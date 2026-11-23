import { normalizeName } from '../../../core/clients.ts';
import type { ProductClass } from '../../../core/types.ts';

/** Union of custom field keys/labels across classes (first label wins), sorted by label. */
export function customFieldLabels(classes: ProductClass[]): { key: string; label: string }[] {
  const m = new Map<string, string>();
  for (const c of classes) for (const f of c.customFields) if (!m.has(f.key)) m.set(f.key, f.label);
  return [...m].map(([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label));
}

/** Classes whose value for `key` contains `text` (case/accent-insensitive, numbers as text). No key or text: all. */
export function filterByCustomField(classes: ProductClass[], key: string, text: string): ProductClass[] {
  const t = normalizeName(text);
  if (!key || !t) return classes;
  return classes.filter((c) => normalizeName(String(c.customValues[key] ?? '')).includes(t));
}
