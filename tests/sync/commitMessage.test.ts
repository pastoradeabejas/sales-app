import { describe, expect, it } from 'vitest';
import { commitMessage, conflictToast } from '../../src/sync/commitMessage.ts';

const classes: Record<string, any> = {
  parm: { id: 'parm', name: 'Parmigiano Reggiano', unit: { name: 'kg', decimals: 3 } },
  milk: { id: 'milk', name: 'Milk', unit: { name: 'kg', decimals: 3 } },
  yog: { id: 'yog', name: 'Yogurt', unit: { name: 'pcs', decimals: 0 } },
};
const clients: Record<string, any> = { c1: { id: 'c1', name: 'Marta' } };
const lookup = async (store: string, id: string) => (store === 'products' ? classes[id] : store === 'clients' ? clients[id] : undefined);

const entry = (recordType: string, content: object) => ({ recordType, content }) as any;
const order = {
  clientId: 'c1', clientName: 'Marta', total: 2800, voided: false,
  lines: [{ kind: 'fixed', quantity: 2, className: 'Parmigiano Reggiano', variantLabel: '500 g', amount: 1000, decimals: 3, unitName: 'kg' }],
};

describe('commitMessage (§6.2)', () => {
  it('formats orders, voids included', async () => {
    expect(await commitMessage('Phone A', entry('order', order), lookup)).toBe('[Phone A] order: Marta, 2× Parmigiano Reggiano 500 g (€28.00)');
    expect(await commitMessage('Mac', entry('order', { ...order, voided: true }), lookup)).toBe('[Mac] order void: Marta, 2× Parmigiano Reggiano 500 g (€28.00)');
  });

  it('formats payments with the client name', async () => {
    const p = { clientId: 'c1', amount: 5000, method: 'cash', voided: false };
    expect(await commitMessage('Mac', entry('payment', p), lookup)).toBe('[Mac] payment: Marta €50.00 (cash)');
    expect(await commitMessage('Mac', entry('payment', { ...p, voided: true }), lookup)).toBe('[Mac] payment void: Marta €50.00 (cash)');
  });

  it('formats stock add, remove and transform', async () => {
    const add = { type: 'add', classId: 'parm', amount: 12000, voided: false };
    expect(await commitMessage('Phone B', entry('stock', add), lookup)).toBe('[Phone B] stock add: Parmigiano Reggiano +12 kg');
    expect(await commitMessage('Phone B', entry('stock', { ...add, type: 'remove', amount: 1500 }), lookup)).toBe('[Phone B] stock remove: Parmigiano Reggiano −1.5 kg');
    const tr = { type: 'transform', inputs: [{ classId: 'milk', amount: 500000 }], outputs: [{ classId: 'yog', amount: 10000 }], voided: false };
    expect(await commitMessage('Mac', entry('stock', tr), lookup)).toBe('[Mac] transform: Milk −500 kg → Yogurt +10,000 pcs');
    expect(await commitMessage('Mac', entry('stock', { ...tr, voided: true }), lookup)).toBe('[Mac] transform void: Milk −500 kg → Yogurt +10,000 pcs');
  });

  it('formats purchases, suppliers and work levels (§16.8)', async () => {
    const p = {
      supplierName: 'Envases Levante', total: 13500, voided: false,
      lines: [{ className: 'Packaging/Lid', amount: 900, decimals: 0, unitName: 'pcs', lineTotal: 13500 }],
    };
    expect(await commitMessage('Phone A', entry('purchase', p), lookup)).toBe('[Phone A] purchase: Envases Levante, Packaging/Lid +900 pcs (€135.00)');
    expect(await commitMessage('Mac', entry('purchase', { ...p, supplierName: '', voided: true }), lookup)).toBe('[Mac] purchase void: No supplier, Packaging/Lid +900 pcs (€135.00)');
    expect(await commitMessage('Mac', entry('supplier', { name: 'Envases Levante' }), lookup)).toBe('[Mac] supplier: Envases Levante');
    expect(await commitMessage('Mac', entry('level', { name: 'Level 2', hourlyRate: 1450 }), lookup)).toBe('[Mac] level: Level 2 €14.50/h');
  });

  it('formats products, clients and recipes by name', async () => {
    expect(await commitMessage('Mac', entry('product', { name: 'Parmigiano Reggiano' }), lookup)).toBe('[Mac] product: Parmigiano Reggiano');
    expect(await commitMessage('Mac', entry('client', { name: 'Marta' }), lookup)).toBe('[Mac] client: Marta');
    expect(await commitMessage('Mac', entry('recipe', { name: 'Yogurt from milk' }), lookup)).toBe('[Mac] recipe: Yogurt from milk');
  });

  it('uses the full name of grouped products', async () => {
    classes.bulk = { id: 'bulk', name: 'Bulk', group: 'Honey/Rosemary', unit: { name: 'kg', decimals: 3 } };
    classes.jar = { id: 'jar', name: '500g Jar', group: 'Honey/Rosemary', unit: { name: 'jar', decimals: 0 } };
    expect(await commitMessage('Mac', entry('product', { name: '500g Jar', group: 'Honey/Rosemary' }), lookup)).toBe('[Mac] product: Honey - Rosemary - 500g Jar');
    const tr = { type: 'transform', inputs: [{ classId: 'bulk', amount: 500 }], outputs: [{ classId: 'jar', amount: 1 }], voided: false };
    expect(await commitMessage('Mac', entry('stock', tr), lookup)).toBe('[Mac] transform: Honey - Rosemary - Bulk −0.5 kg → Honey - Rosemary - 500g Jar +1 jar');
  });

  it('builds the conflict toast (§6.4)', async () => {
    expect(await conflictToast('order', { ...order, updatedBy: 'Phone B' }, lookup)).toBe("Marta's order was changed on Phone B; showing the latest version");
    expect(await conflictToast('client', { name: 'Marta', updatedBy: 'Mac' }, lookup)).toBe('Marta was changed on Mac; showing the latest version');
  });
});
