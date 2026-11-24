import { describe, it, expect } from 'vitest';
import { toCsv, ordersCsv, linesCsv, paymentsCsv, clientsCsv, stockCsv, purchasesCsv, suppliersCsv, exportFiles } from '../../src/core/csv.ts';
import { allocateAll } from '../../src/core/payments.ts';
import type { Client, Order, OrderLine, Payment, ProductClass, Purchase, StockEvent, Supplier } from '../../src/core/types.ts';

const stamp = { schema: 1, createdAt: '2026-11-20T10:00:00Z', updatedAt: '2026-11-20T10:00:00Z', updatedBy: 'Phone A' };
const line = (o: Partial<OrderLine>): OrderLine => ({
  lineId: 'l1', classId: 'c1', variantId: 'v1', className: 'Parmigiano', variantLabel: '500 g', kind: 'fixed', unitName: 'kg',
  decimals: 3, quantity: 2, amount: 1000, unitPrice: 1500, unitCost: 1000, lineTotal: 3000, ...o,
});
const order = (o: Partial<Order>): Order => ({
  ...stamp, id: 'o1', date: '2026-11-20', clientId: 'k1', clientName: 'Lucía', lines: [line({})], total: 3000, note: '', voided: false, voidReason: null, ...o,
});
const pay = (o: Partial<Payment>): Payment => ({
  ...stamp, id: 'p1', date: '2026-11-21', clientId: 'k1', orderId: 'o1', amount: 1000, method: 'cash', note: '', voided: false, ...o,
});
const client: Client = { ...stamp, id: 'k1', name: 'Lucía', phone: '600', notes: 'a, b', tags: ['vip', 'bar'], archived: false };
const cls = { id: 'c1', name: 'Milk', unit: { name: 'kg', decimals: 3 } } as ProductClass;
const classes = new Map([['c1', cls]]);

describe('toCsv', () => {
  it('starts with a BOM and ends rows with CRLF', () => {
    expect(toCsv(['a', 'b'], [[1, 'x']])).toBe('﻿a,b\r\n1,x\r\n');
  });
  it('quotes commas, quotes, newlines and edge spaces; doubles quotes', () => {
    const out = toCsv(['h'], [['a,b'], ['say "hi"'], ['l1\nl2'], ['l1\rl2'], [' pad'], ['pad ']]);
    expect(out).toBe('﻿h\r\n"a,b"\r\n"say ""hi"""\r\n"l1\nl2"\r\n"l1\rl2"\r\n" pad"\r\n"pad "\r\n');
  });
  it('writes null as empty, booleans as true/false, keeps Lucía', () => {
    expect(toCsv(['a', 'b', 'c'], [[null, true, 'Lucía']])).toBe('﻿a,b,c\r\n,true,Lucía\r\n');
  });
});

describe('exports', () => {
  const rows = (csv: string) => csv.replace('﻿', '').trimEnd().split('\r\n');
  it('ordersCsv: totals, paid, status, voided', () => {
    const orders = [order({}), order({ id: 'o2', voided: true, voidReason: 'mistake', note: 'x, y' })];
    const out = rows(ordersCsv(orders, [pay({})]));
    expect(out[0]).toBe('id,date,client,total_eur,paid_eur,owed_eur,status,note,voided,void_reason,created_at,updated_by');
    expect(out[1]).toBe('o1,2026-11-20,Lucía,30.00,10.00,20.00,partial,,false,,2026-11-20T10:00:00Z,Phone A');
    expect(out[2]).toBe('o2,2026-11-20,Lucía,30.00,0.00,0.00,voided,"x, y",true,mistake,2026-11-20T10:00:00Z,Phone A');
  });
  it('linesCsv: fixed and variable (1.37 kg) lines', () => {
    const v = line({ lineId: 'l2', kind: 'variable', variantLabel: 'by weight', quantity: null, amount: 1370, unitPrice: 2600, unitCost: 1666.6667, lineTotal: 3562 });
    const out = rows(linesCsv([order({ lines: [line({}), v] }), order({ id: 'o2', voided: true })]));
    expect(out[0]).toBe('order_id,date,client,class,variant,kind,quantity,amount,unit,unit_price_eur,line_total_eur,unit_cost_eur,voided');
    expect(out[1]).toBe('o1,2026-11-20,Lucía,Parmigiano,500 g,fixed,2,1,kg,15.00,30.00,10.00,false');
    expect(out[2]).toBe('o1,2026-11-20,Lucía,Parmigiano,by weight,variable,,1.37,kg,26.00,35.62,16.666667,false');
    expect(out[3].endsWith(',true')).toBe(true);
  });
  it('paymentsCsv', () => {
    const out = rows(paymentsCsv([pay({}), pay({ id: 'p2', orderId: null, voided: true, note: 'q"' })], new Map([['k1', client]])));
    expect(out[0]).toBe('id,date,client,order_id,amount_eur,method,note,voided');
    expect(out[1]).toBe('p1,2026-11-21,Lucía,o1,10.00,cash,,false');
    expect(out[2]).toBe('p2,2026-11-21,Lucía,,10.00,cash,"q""",true');
  });
  it('clientsCsv: tags joined, owed and credit', () => {
    const out = rows(clientsCsv([client], allocateAll([order({})], [])));
    expect(out[0]).toBe('id,name,phone,tags,notes,owed_eur,credit_eur,archived');
    expect(out[1]).toBe('k1,Lucía,600,vip;bar,"a, b",30.00,0.00,false');
    expect(rows(clientsCsv([{ ...client, id: 'k9' }], new Map()))[1]).toBe('k9,Lucía,600,vip;bar,"a, b",0.00,0.00,false');
  });
  it('stockCsv: add, remove (voided), transform in/out', () => {
    const events: StockEvent[] = [
      { ...stamp, id: 'e1', date: '2026-11-01', type: 'add', classId: 'c1', amount: 1500, unitCost: 0.5, reason: '', note: 'n', voided: false },
      { ...stamp, id: 'e2', date: '2026-11-02', type: 'remove', classId: 'c1', amount: 250, unitCost: null, reason: 'Waste', note: '', voided: true },
      { ...stamp, id: 'e3', date: '2026-11-03', type: 'transform', inputs: [{ classId: 'c1', amount: 1000 }], outputs: [{ classId: 'c1', amount: 20000 }], recipeId: null, costs: null, note: '', voided: false },
    ];
    const out = rows(stockCsv(events, classes));
    expect(out[0]).toBe('event_id,date,type,class,amount,unit,unit_cost_eur,reason,note,voided');
    expect(out[1]).toBe('e1,2026-11-01,add,Milk,1.5,kg,0.005,,n,false');
    expect(out[2]).toBe('e2,2026-11-02,remove,Milk,0.25,kg,,Waste,,true');
    expect(out[3]).toBe('e3,2026-11-03,transform in,Milk,1,kg,,,,false');
    expect(out[4]).toBe('e3,2026-11-03,transform out,Milk,20,kg,,,,false');
  });
  it('stockCsv: a grouped class shows its full name', () => {
    const grouped = { ...cls, id: 'c2', name: '500g Jar', group: 'Honey/Rosemary' } as ProductClass;
    const e: StockEvent = { ...stamp, id: 'e4', date: '2026-11-04', type: 'add', classId: 'c2', amount: 3, unitCost: null, reason: '', note: '', voided: false };
    expect(rows(stockCsv([e], new Map([['c2', grouped]])))[1]).toContain(',add,Honey - Rosemary - 500g Jar,');
  });
  it('purchasesCsv: one row per line, amount in base units, euros', () => {
    const p: Purchase = {
      ...stamp, id: 'u1', date: '2026-11-05', supplierId: 's1', supplierName: 'Envases, Levante', total: 17500, method: 'bizum', note: 'n', voided: false,
      lines: [
        { lineId: 'a', classId: 'c1', className: 'Lid', unitName: 'pcs', decimals: 0, amount: 900, lineTotal: 13500 },
        { lineId: 'b', classId: 'c2', className: 'Honey', unitName: 'kg', decimals: 3, amount: 1500, lineTotal: 4000 },
      ],
    };
    const out = rows(purchasesCsv([p]));
    expect(out[0]).toBe('date,purchase_id,supplier,item,amount,unit,line_total_eur,method,note,voided');
    expect(out[1]).toBe('2026-11-05,u1,"Envases, Levante",Lid,900,pcs,135.00,bizum,n,false');
    expect(out[2]).toBe('2026-11-05,u1,"Envases, Levante",Honey,1.5,kg,40.00,bizum,n,false');
  });
  it('suppliersCsv: one row per supplier', () => {
    const s: Supplier = { ...stamp, id: 's1', name: 'Gasolinera', phone: '600', notes: 'x', archived: true };
    expect(rows(suppliersCsv([s]))).toEqual(['name,phone,notes,archived', 'Gasolinera,600,x,true']);
  });
  it('exportFiles: seven named files', () => {
    const files = exportFiles({ orders: [], payments: [], clients: [], stock: [], classes: [], purchases: [], suppliers: [] }, '2026-11-24');
    expect(files.map((f) => f.name)).toEqual([
      'sales-orders-2026-11-24.csv', 'sales-lines-2026-11-24.csv', 'sales-payments-2026-11-24.csv', 'sales-clients-2026-11-24.csv', 'sales-stock-2026-11-24.csv',
      'sales-purchases-2026-11-24.csv', 'sales-suppliers-2026-11-24.csv',
    ]);
    expect(files[0].content.startsWith('﻿id,date')).toBe(true);
  });
});
