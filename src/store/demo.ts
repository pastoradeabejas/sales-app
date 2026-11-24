// Demo mode sample data (spec §2.1, §15): 15 months of a farm shop, deterministic and relative to `today`, loaded without outbox.
// Orders follow each client's rhythm and the seasons; stock is made or bought just in time, so it only runs out where a case says so.
import { buildTransformCosts, labourCosts } from '../core/costs.ts';
import { fullName } from '../core/groups.ts';
import { saleUnitCost } from '../core/orders.ts';
import { perBaseUnit } from '../core/stock.ts';
import {
  RECORD_SCHEMA,
  type ClassAmount, type Client, type CostShare, type Decimals, type IsoDate, type LabourRow, type Order, type OrderLine, type Payment,
  type PaymentMethod, type ProductClass, type Purchase, type PurchaseLine, type Recipe, type RecordType, type StockEvent, type Supplier,
  type Timestamp, type Variant, type WorkLevel,
} from '../core/types.ts';
import type { Store } from './store.ts';

/** Days of history before today. */
export const DEMO_DAYS = 455;

type Item = { type: RecordType; record: object };
type Policy = 'now' | 'later' | 'instal' | 'slow' | 'never' | 'credit';

const shift = (date: IsoDate, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
// Half-up rounding of a / d for non-negative integers, without floats.
const roundDiv = (a: number, d: number) => Math.floor((2 * a + d) / (2 * d));
const round4 = (x: number) => Math.round(Number((x * 1e4).toPrecision(12))) / 1e4;
const pad = (n: number) => String(n).padStart(4, '0');
/** A moment of a day: hour plus n × 20 s, so records of one day keep their order. */
const at = (date: IsoDate, hour: number, n: number) => new Date(Date.parse(`${date}T${String(hour).padStart(2, '0')}:00:00Z`) + n * 20_000).toISOString();

/** Seeded generator (mulberry32): the same numbers on every device. */
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Sales per month relative to the average: summer dip, Christmas peak.
const SEASON = [0.8, 0.8, 0.9, 1, 1.1, 1, 0.85, 0.6, 1, 1.1, 1.25, 1.7];

// [name, phone, tags, first day ago, last day ago, days between orders, variant keys, payment policy, buys gifts].
// Policy: now = paid at once, later = monthly payment of what is owed, instal = half now and the rest in instalments,
// slow = nothing paid in the last 120 days, never = never pays, credit = pays advances that cover the orders.
const CLIENTS: [string, string, string[], number, number, number, string, Policy, boolean?][] = [
  ['Marta', '+34 600 111 222', ['family'], 450, 0, 9, 'f5 r1 pol comb mk y4 lav ch5', 'now', true],
  ['Lucía', '+34 611 222 333', ['neighbour'], 448, 2, 12, 'f5 o5 fc chw comb', 'later', true],
  ['Javier', '', ['work'], 440, 5, 16, 'r5 r1 cho pl', 'instal'],
  ['Ana', '', [], 445, 0, 10, 'f1 mk y1 fc but wh', 'now'],
  ['Pedro', '+34 622 333 444', [], 450, 1, 11, 'r1 comb mbf stk', 'slow'],
  ['Carmen', '', ['family'], 430, 0, 14, 'pol f5 kef but', 'credit', true],
  ['Luis', '', [], 420, 3, 18, 'f5 h5 lav o1', 'later', true],
  ['Rosa', '+34 633 100 101', ['market'], 455, 0, 7, 'dz hd but kef cl h5 dzt', 'now'],
  ['Antonio', '+34 633 100 102', ['restaurant'], 450, 1, 6, 'sau lam but dz kef sa4', 'later'],
  ['Elena', '+34 633 100 103', ['shop'], 452, 2, 9, 'h5 cs cl prop but sa4', 'instal', true],
  ['Miguel', '', ['family'], 400, 10, 20, 'h1 cl dz lam', 'now'],
  ['Carlos', '+34 633 100 105', ['restaurant'], 455, 0, 6, 'sau lam dz but kef stk dzt', 'now'],
  ['Isabel', '', ['market'], 440, 4, 10, 'cs cl hd kef prop', 'now'],
  ['Francisco', '+34 633 100 107', ['shop'], 430, 2, 9, 'h5 h1 sa4 but kef cs', 'slow'],
  ['Pilar', '', ['neighbour'], 380, 8, 15, 'dz kef but', 'now'],
  ['Joaquín', '+34 633 100 109', ['restaurant'], 200, 12, 14, 'sau lam dz but', 'never'],
  ['Dolores', '', ['family'], 410, 4, 13, 'h5 cl prop hd lam', 'instal', true],
  ['Raúl', '', [], 450, 75, 20, 'sa4 dz', 'later'],
  ['Teresa', '+34 633 100 112', ['market'], 445, 3, 8, 'dz hd cs cl kef but dzt', 'now'],
  ['Sergio', '+34 633 100 113', ['shop'], 435, 5, 11, 'h5 h1 cl prop sa4', 'now', true],
  ['Inés', '', ['neighbour'], 455, 70, 15, 'hd kef but', 'now'],
  ['Fernando', '+34 633 100 115', ['restaurant'], 440, 1, 7, 'sau lam dz sa4 but chw', 'later'],
  ['Beatriz', '', ['work'], 400, 80, 16, 'cs h5', 'instal'],
  ['Alberto', '', [], 390, 66, 18, 'lam dz', 'now'],
  ['Cristina', '+34 633 100 118', ['market'], 420, 0, 9, 'cl cs h5 hd kef prop', 'now', true],
  ['Maricarmen López', '', ['family'], 440, 2, 12, 'f5 r5 y4 fc', 'now'],
  ['Bar El Sol', '+34 655 000 111', ['restaurant'], 450, 300, 7, 'sau chw pl mk', 'now'],
  ['Tienda Ecológica Luna', '+34 655 000 222', ['shop'], 420, 1, 10, 'f5 f1 o5 o1 pol prop wh', 'later'],
  ['Rocío', '', ['neighbour'], 350, 0, 13, 'y1 y4 mk fc wh', 'now'],
  ['Manuel', '+34 644 555 666', ['work'], 330, 6, 17, 'stk mbf mb5 cho', 'instal'],
  ['Nuria', '', ['market'], 450, 2, 12, 'lav f5 h5 pol ch5', 'now', true],
  ['Jorge', '', [], 250, 0, 21, 'mk dz', 'now'],
  ['Paula', '+34 699 888 777', ['family'], 180, 0, 10, 'y4 fc but kef', 'credit'],
  ['Hotel Mirador', '+34 655 000 333', ['restaurant'], 380, 0, 8, 'lam stk chw sau mk but wh', 'instal'],
  ['Eva', '', ['work'], 120, 0, 15, 'h5 cl o5', 'now', true],
];
const RENAMED = { client: 'Maricarmen López', oldName: 'Mari Carmen', since: 60 };
const ARCHIVED_CLIENT = 'Bar El Sol';
// Variants on sale only part of the time (days ago): the archived lavender jar and egg tray, the Christmas boxes.
const UNTIL: Record<string, number> = { lav: 300, dzt: 250 };
const RESTAURANT_DISCOUNT = 0.9;
const PRICE_RISE_DAYS = 200;
const OLD_PRICE = 0.92;

/** Sample records for Demo mode; `today` is the local date, `now` stamps the catalogue. */
export function demoRecords(today: IsoDate, now: Timestamp): Item[] {
  const r = random(20261124);
  const ago = (n: number) => shift(today, -n);
  const start = ago(DEMO_DAYS);
  const made = { schema: RECORD_SCHEMA, createdAt: at(start, 5, 0), updatedAt: now, updatedBy: 'Demo' };
  const stamp = (createdAt: Timestamp) => ({ schema: RECORD_SCHEMA, createdAt, updatedAt: createdAt, updatedBy: 'Demo' });

  // ---------- catalogue ----------
  const variants = new Map<string, { cls: ProductClass; v: Variant }>();
  const products: ProductClass[] = [];
  const product = (
    group: string, name: string, unit: string, decimals: Decimals, low: number | null, sellable: boolean,
    vs: [key: string, label: string, baseAmount: number | null, price: number, cost: number | null, archived?: boolean][] = [],
    extra: Partial<ProductClass> = {},
  ): ProductClass => {
    const cls: ProductClass = {
      ...made, id: `demo-class-${String(products.length + 1).padStart(2, '0')}`, name, group, unit: { name: unit, decimals },
      lowStockThreshold: low, trackStock: true, sellable, customFields: [], customValues: {}, notes: '', archived: false, variants: [], ...extra,
    };
    cls.variants = vs.map(([key, label, baseAmount, price, cost, archived], i) => {
      const v: Variant = {
        createdAt: made.createdAt, updatedAt: now, updatedBy: 'Demo', id: `demo-var-${key}`, label, kind: baseAmount === null ? 'variable' : 'fixed',
        baseAmount, price, cost, sortOrder: i + 1, archived: archived ?? false,
      };
      variants.set(key, { cls, v });
      return v;
    });
    products.push(cls);
    return cls;
  };
  const harvest = (season: string): Partial<ProductClass> => ({
    customFields: [{ key: 'harvest', label: 'Harvest', type: 'text' }], customValues: { harvest: season },
  });
  const bulk = (honey: string) => product(`Honey/${honey}`, 'Bulk', 'kg', 3, 5000, false);
  const jar = (honey: string, name: string, key: string, label: string, price: number, cost: number, low: number, season: string) =>
    product(`Honey/${honey}`, name, 'jar', 0, low, true, [[key, label, 1, price, cost]], harvest(season));
  const flowerBulk = bulk('Flower');
  const f5 = jar('Flower', '500g Jar', 'f5', '500 g', 850, 390, 10, 'Spring');
  const f1 = jar('Flower', '1kg Jar', 'f1', '1 kg', 1500, 770, 10, 'Spring');
  const rosemaryBulk = bulk('Rosemary');
  const r5 = jar('Rosemary', '500g Jar', 'r5', '500 g', 950, 465, 10, 'Spring');
  const r1 = jar('Rosemary', '1kg Jar', 'r1', '1 kg', 1700, 880, 10, 'Spring');
  const oakBulk = bulk('Oak');
  const o5 = jar('Oak', '500g Jar', 'o5', '500 g', 900, 515, 10, 'Autumn');
  const o1 = jar('Oak', '1kg Jar', 'o1', '1 kg', 1600, 980, 10, 'Autumn');
  const heatherBulk = bulk('Heather');
  const h5 = jar('Heather', '500g Jar', 'h5', '500 g', 1250, 555, 10, 'Autumn');
  const h1 = jar('Heather', '1kg Jar', 'h1', '1 kg', 2200, 1070, 8, 'Autumn');
  const lavender = product('Honey/Lavender', '500g Jar', 'jar', 0, 10, true, [['lav', '500 g', 1, 1100, 520]], { ...harvest('Summer'), archived: true, notes: 'No longer made.' });
  const chestnut = product('Honey/Chestnut', '500g Jar', 'jar', 0, 6, true, [['ch5', '500 g', 1, 1000, null]], { notes: "From a neighbour's hives; no cost known." });
  const packaging = (name: string, low: number) => product('Packaging', name, 'pcs', 0, low, false);
  const emptyJar5 = packaging('Empty jar 500g', 30);
  const emptyJar1 = packaging('Empty jar 1kg', 20);
  const lid = packaging('Lid', 50);
  const giftBox = packaging('Gift box', 5);
  const labels = packaging('Labels', 100);
  const butterPaper = packaging('Butter paper', 30);
  const kefirBottle = packaging('Kefir bottle', 20);
  const eggBox = packaging('Egg box', 20);
  const xmasBox = product('Gifts', 'Christmas box', 'pcs', 0, 3, true, [['box', 'Box', 1, 2500, 1520], ['box2', 'Deluxe (honey + candle)', 1, 3600, null]]);
  const comb = product('Honeycomb', 'Honeycomb', 'kg', 3, 2000, true, [['comb', 'By weight', null, 3000, 2000]]);
  const pollen = product('Pollen', '250g Jar', 'jar', 0, 8, true, [['pol', '250 g', 1, 700, 250]]);
  const rawMilk = product('Dairy/Milk', 'Raw milk', 'L', 0, 50, false);
  const bottle = product('Dairy/Milk', '1L Bottle', 'bottle', 0, 10, true, [['mk', '1 L', 1, 180, 90]]);
  const curedCheese = product('Dairy/Cheese', 'Cured cheese', 'kg', 3, 2000, true, [['chw', 'By weight', null, 1800, 900], ['chq', 'Quarter 750 g', 750, 1350, 700]], {
    customFields: [{ key: 'cure', label: 'Cure (months)', type: 'number' }], customValues: { cure: 6 },
  });
  const whey = product('Dairy/Cheese', 'Whey', 'L', 0, 10, true, [['wh', '1 L', 1, 150, null]], { notes: 'Made with the cured cheese.' });
  const freshCheese = product('Dairy/Cheese', 'Fresh cheese', 'pcs', 0, 6, true, [['fc', '250 g', 1, 350, 160]]);
  const yogurt = product('Dairy/Yogurt', 'Natural yogurt', 'pot', 0, 10, true, [['y1', 'Single', 1, 90, 40], ['y4', 'Pack of 4', 4, 320, 160]]);
  const butter = product('Dairy/Butter', 'Butter', 'pcs', 0, 8, true, [['but', '250 g', 1, 480, 260]]);
  const kefir = product('Dairy/Kefir', 'Kefir', 'bottle', 0, 8, true, [['kef', '500 ml', 1, 280, 120]]);
  const chorizo = product('Meat/Pork', 'Chorizo', 'pcs', 0, 5, true, [['cho', 'Piece', 1, 650, 380]]);
  const porkLoin = product('Meat/Pork', 'Pork loin', 'kg', 3, 3000, true, [['pl', 'By weight', null, 1100, 700]]);
  const sausages = product('Meat/Pork', 'Sausages', 'kg', 3, 2000, true, [['sau', 'By weight', null, 1450, 900], ['sa4', '400 g pack', 400, 620, 380]]);
  const minced = product('Meat/Beef', 'Minced beef', 'kg', 3, 2000, true, [['mbf', 'By weight', null, 1300, 850], ['mb5', '500 g pack', 500, 700, 430]]);
  const steak = product('Meat/Beef', 'Steak', 'kg', 3, 1000, true, [['stk', 'By weight', null, 2600, 1700]]);
  const lamb = product('Meat/Lamb', 'Lamb chops', 'kg', 3, 1500, true, [['lam', 'By weight', null, 2400, 1600]]);
  const smallCandle = product('Candles', 'Small candle', 'pcs', 0, 10, true, [['cs', 'Beeswax', 1, 650, null]]);
  const largeCandle = product('Candles', 'Large candle', 'pcs', 0, 6, true, [['cl', 'Beeswax', 1, 1450, null]]);
  const propolis = product('Wellness', 'Propolis tincture', 'pcs', 0, 5, true, [['prop', '30 ml', 1, 1200, 600]]);
  const eggs = product('Eggs', 'Eggs', 'egg', 0, 24, true, [['dz', 'Dozen', 12, 360, 220], ['hd', 'Half dozen', 6, 190, null], ['dzt', 'Tray of 30', 30, 850, 520, true]]);
  const raw = (name: string, unit: string, decimals: Decimals, low: number) => product('Raw materials', name, unit, decimals, low, false);
  const wick = raw('Candle wick', 'm', 2, 500);
  const beeswax = raw('Beeswax', 'kg', 3, 1000);
  const casing = raw('Sausage casing', 'm', 1, 100);
  const porkShoulder = raw('Pork shoulder', 'kg', 3, 3000);
  const looseEggs = raw('Loose eggs', 'egg', 0, 60);
  const expense = (name: string) => product('Expenses', name, 'pcs', 0, null, false, [], { trackStock: false });
  const [fuel, marketFee, hiveTreatment, electricity, vet, transport, stallRent, phone, insurance, equipment, feed] =
    ['Fuel', 'Market fee', 'Hive treatment', 'Electricity', 'Vet', 'Packaging transport', 'Market stall rent', 'Phone', 'Insurance', 'Equipment', 'Feed'].map(expense);
  const byId = new Map(products.map((p) => [p.id, p]));

  const suppliers: Supplier[] = ['Envases Levante', 'Apícola Sur', 'Gasolinera', 'Piensos del Valle', 'Clínica Veterinaria Sol', 'Iberluz',
    'Seguros Mediterráneo', 'Imprenta Gráfica', 'Granja La Vega', 'Carnes Ruiz']
    .map((name, i) => ({ ...made, id: `demo-supplier-${i + 1}`, name, phone: '', notes: '', archived: false }));
  const [envases, apicola, gasolinera, piensos, clinica, iberluz, seguros, imprenta, granja, carnes] = suppliers;
  const levels: WorkLevel[] = ([['Level 1', 1200], ['Level 2', 1450], ['Level 3', 1800]] as const).map(([name, hourlyRate], i) => ({
    ...made, id: `demo-level-${i + 1}`, name, hourlyRate, archived: false,
  }));
  const levelsById = new Map(levels.map((l) => [l.id, l]));
  const [L1, L2, L3] = levels.map((l) => l.id);

  // ---------- recipes ----------
  const recipes: Recipe[] = [];
  const recipe = (key: string, name: string, inputs: [ProductClass, number][], outputs: [ProductClass, number][], extras: [string, number][], labour: [string, number][], shares?: number[]) => {
    const rec: Recipe = {
      ...made, id: `demo-recipe-${key}`, name, inputs: inputs.map(([c, amount]) => ({ classId: c.id, amount })),
      outputs: outputs.map(([c, amount]) => ({ classId: c.id, amount })), extras: extras.map(([label, amount]) => ({ label, amount })),
      shares: outputs.map(([c], i) => ({ classId: c.id, share: shares?.[i] ?? 1 / outputs.length })),
      labour: labour.map(([levelId, minutes]) => ({ levelId, minutes })), archived: false,
    };
    recipes.push(rec);
    return rec;
  };
  const fill = (key: string, honey: string, size: string, bulkCls: ProductClass, empty: ProductClass, out: ProductClass, grams: number, minutes: number) =>
    recipe(key, `Fill ${honey} ${size}`, [[empty, 1], [lid, 1], [labels, 1], [bulkCls, grams]], [[out, 1]], [['Sealing wax', 8]], [[L1, minutes]]);
  // Maker of each class (the recipe that refills it) and the smallest batch run.
  const makers = new Map<string, { rec: Recipe; min: number }>();
  const maker = (rec: Recipe, min: number) => rec.outputs.forEach((o) => makers.set(o.classId, { rec, min }));
  maker(fill('f5', 'Flower', '500g', flowerBulk, emptyJar5, f5, 500, 2), 24);
  maker(fill('f1', 'Flower', '1kg', flowerBulk, emptyJar1, f1, 1000, 3), 12);
  maker(fill('r5', 'Rosemary', '500g', rosemaryBulk, emptyJar5, r5, 500, 2), 24);
  maker(fill('r1', 'Rosemary', '1kg', rosemaryBulk, emptyJar1, r1, 1000, 3), 12);
  maker(fill('o5', 'Oak', '500g', oakBulk, emptyJar5, o5, 500, 2), 24);
  maker(fill('o1', 'Oak', '1kg', oakBulk, emptyJar1, o1, 1000, 3), 12);
  maker(fill('h5', 'Heather', '500g', heatherBulk, emptyJar5, h5, 500, 2), 24);
  maker(fill('h1', 'Heather', '1kg', heatherBulk, emptyJar1, h1, 1000, 3), 12);
  maker(recipe('box', 'Christmas box', [[f5, 1], [r1, 1], [giftBox, 1]], [[xmasBox, 1]], [['Ribbon', 60]], [[L2, 5]]), 6);
  const deluxe = recipe('deluxe', 'Deluxe gift box', [[h5, 1], [largeCandle, 1], [giftBox, 1]], [[xmasBox, 1]], [['Ribbon', 60]], [[L2, 6]]);
  const candleL = recipe('candle-l', 'Make large candle', [[beeswax, 250], [wick, 30], [labels, 1]], [[largeCandle, 1]], [['Electricity', 15]], [[L2, 20]]);
  maker(candleL, 10);
  maker(recipe('candle-s', 'Make small candle', [[beeswax, 90], [wick, 20], [labels, 1]], [[smallCandle, 1]], [['Electricity', 8]], [[L2, 8]]), 20);
  maker(recipe('butter', 'Make butter', [[rawMilk, 10], [butterPaper, 4]], [[butter, 4]], [['Salt', 30], ['Electricity', 30]], [[L2, 15]]), 3);
  maker(recipe('kefir', 'Make kefir', [[rawMilk, 1], [kefirBottle, 2]], [[kefir, 2]], [['Cultures', 25]], [[L1, 6]]), 10);
  maker(recipe('sausage', 'Make sausages', [[porkShoulder, 10000], [casing, 800]], [[sausages, 9000]], [['Spices', 1200], ['Electricity', 40]], [[L3, 60]]), 1);
  maker(recipe('eggs', 'Pack eggs', [[looseEggs, 12], [eggBox, 1]], [[eggs, 12]], [['Label', 5]], [[L1, 2]]), 10);
  maker(recipe('cheese', 'Make cured cheese and whey', [[rawMilk, 10]], [[curedCheese, 1000], [whey, 1]], [['Rennet & salt', 150]], [[L3, 8]], [0.95, 0.05]), 6);
  maker(recipe('fresh', 'Make fresh cheese', [[rawMilk, 2]], [[freshCheese, 1]], [['Salt', 5]], [[L1, 4]]), 12);
  maker(recipe('bottle', 'Bottle milk', [[rawMilk, 1]], [[bottle, 1]], [['Bottle', 40]], [[L1, 1]]), 30);
  maker(recipe('yogurt', 'Make yogurt', [[rawMilk, 1]], [[yogurt, 8]], [['Cultures', 20], ['Pots', 80]], [[L1, 10]]), 4);

  // Bought classes: supplier, lot size and cost per base unit at the start (prices rise 5 % every 150 days).
  const sources = new Map<string, { from: Supplier | null; lot: number; cost: number }>();
  const source = (c: ProductClass, from: Supplier | null, lot: number, cost: number) => sources.set(c.id, { from, lot, cost });
  source(flowerBulk, apicola, 40000, 650); source(rosemaryBulk, apicola, 30000, 800); source(oakBulk, apicola, 25000, 900); source(heatherBulk, apicola, 25000, 1000);
  source(lavender, apicola, 24, 520); source(comb, apicola, 8000, 2000); source(pollen, apicola, 24, 250); source(propolis, apicola, 12, 600);
  source(beeswax, apicola, 5000, 2200); source(wick, apicola, 1000, 90);
  source(emptyJar5, envases, 200, 35); source(emptyJar1, envases, 120, 50); source(lid, envases, 300, 12); source(giftBox, envases, 30, 150);
  source(butterPaper, envases, 100, 8); source(kefirBottle, envases, 100, 45); source(eggBox, envases, 100, 15); source(casing, envases, 2000, 15);
  source(chestnut, null, 24, 0); source(labels, imprenta, 500, 6); source(rawMilk, granja, 300, 45); source(looseEggs, granja, 360, 15);
  source(chorizo, carnes, 30, 380); source(porkLoin, carnes, 10000, 700); source(minced, carnes, 10000, 850); source(steak, carnes, 6000, 1700);
  source(lamb, carnes, 10000, 1600); source(porkShoulder, carnes, 20000, 450);
  const costOn = (c: { cost: number }, days: number) => Math.round(c.cost * (1 + 0.05 * Math.floor((DEMO_DAYS - days) / 150)));

  // ---------- simulation state ----------
  const bal = new Map<string, number>();
  const avg = new Map<string, number>();
  const incoming = (id: string, amount: number, cost: number | null) => {
    const b = Math.max(bal.get(id) ?? 0, 0); // a negative balance resets to 0 first (§4.3)
    if (cost !== null) avg.set(id, avg.has(id) ? round4((b * avg.get(id)! + amount * cost) / (b + amount)) : cost);
    bal.set(id, b + amount);
  };
  const outgoing = (id: string, amount: number) => bal.set(id, (bal.get(id) ?? 0) - amount);
  const decimals = (id: string) => byId.get(id)!.unit.decimals;
  const methods: PaymentMethod[] = ['cash', 'bizum', 'cash', 'other'];

  const orders: Order[] = [];
  const payments: Payment[] = [];
  const stock: StockEvent[] = [];
  const purchases: Purchase[] = [];
  let day = DEMO_DAYS;
  let date = start;
  const n = { buy: 0, make: 0, order: 0, pay: 0, remove: 0 };

  // Purchases of one day are gathered per supplier and written at the end of the day (at 06:00).
  let basket = new Map<Supplier | null, PurchaseLine[]>();
  const addLine = (from: Supplier | null, c: ProductClass, amount: number, lineTotal: number) => {
    const lines = basket.get(from) ?? basket.set(from, []).get(from)!;
    lines.push({ lineId: '', classId: c.id, className: fullName(c), unitName: c.unit.name, decimals: c.unit.decimals, amount, lineTotal });
  };
  const purchase = (from: Supplier | null, lines: PurchaseLine[], voided = false, note = '') => {
    const id = `demo-purchase-${pad(purchases.length + 1)}`;
    purchases.push({
      ...stamp(at(date, 6, n.buy++)), id, date, supplierId: from?.id ?? null, supplierName: from?.name ?? '',
      lines: lines.map((l, j) => ({ ...l, lineId: `${id}-l${j + 1}` })), total: lines.reduce((t, l) => t + l.lineTotal, 0),
      method: methods[purchases.length % methods.length], note, voided,
    });
  };
  const closeDay = () => {
    for (const [from, lines] of basket) purchase(from, lines);
    basket = new Map();
  };
  const buy = (c: ProductClass, amount: number) => {
    const src = sources.get(c.id)!;
    if (!src.from) {
      // Given, not bought: added to stock without a cost, so its sales have an unknown cost.
      incoming(c.id, amount, null);
      stock.push({
        ...stamp(at(date, 6, 30 + n.buy++)), id: `demo-stock-${pad(stock.length + 1)}`, date, type: 'add', classId: c.id, amount,
        unitCost: null, reason: '', note: "From a neighbour's hives", voided: false,
      });
      return;
    }
    const cost = costOn(src, day);
    incoming(c.id, amount, cost);
    addLine(sources.get(c.id)!.from, c, amount, roundDiv(amount * cost, 10 ** c.unit.decimals));
  };
  const spend = (from: Supplier | null, c: ProductClass, cents: number) => addLine(from, c, 1, cents);

  // Makes or buys what is missing so that `need` of the class is in stock and it stays above its low-stock level.
  const ensure = (id: string, used: number) => {
    const have = Math.max(bal.get(id) ?? 0, 0);
    const need = used + (byId.get(id)!.lowStockThreshold ?? 0);
    if ((bal.get(id) ?? 0) >= need) return;
    const m = makers.get(id);
    if (m) {
      const per = m.rec.outputs.find((o) => o.classId === id)!.amount;
      make(m.rec, Math.max(m.min, Math.ceil((need - have) / per)));
    } else {
      const lot = sources.get(id)!.lot;
      buy(byId.get(id)!, Math.ceil((need - have) / lot) * lot);
    }
  };
  // Runs a recipe `times` times with its cost snapshot; a voided run changes nothing.
  function make(rec: Recipe, times: number, opts: { total?: number; voided?: boolean; note?: string } = {}) {
    const scale = (xs: ClassAmount[]) => xs.map((x) => ({ ...x, amount: x.amount * times }));
    const inputs = scale(rec.inputs);
    const outputs = scale(rec.outputs);
    if (!opts.voided) inputs.forEach((i) => ensure(i.classId, i.amount));
    const materials = Math.round(inputs.reduce((s, i) => s + (i.amount / 10 ** decimals(i.classId)) * (avg.get(i.classId) ?? 0), 0));
    const labour = labourCosts((rec.labour ?? []).map((l: LabourRow) => ({ ...l, minutes: l.minutes * times })), levelsById);
    const extras = rec.extras.map((e) => ({ ...e, amount: e.amount * times }));
    const shares: CostShare[] = rec.shares;
    const costs = buildTransformCosts(opts.total === undefined
      ? { mode: 'breakdown', materials, materialsComplete: true, labour, extras, outputs, shares }
      : { mode: 'total', materials, materialsComplete: true, labour, extras: [], enteredTotal: opts.total, outputs, shares });
    stock.push({
      ...stamp(at(date, 7, n.make++)), id: `demo-stock-${pad(stock.length + 1)}`, date, type: 'transform', inputs, outputs, recipeId: rec.id,
      costs, note: opts.note ?? '', voided: opts.voided ?? false,
    });
    if (opts.voided) return;
    inputs.forEach((i) => outgoing(i.classId, i.amount));
    for (const o of outputs) incoming(o.classId, o.amount, perBaseUnit(costs.total * costs.allocation.find((s) => s.classId === o.classId)!.share, o.amount, decimals(o.classId)));
  }
  const remove = (c: ProductClass, amount: number, reason: string, note = '') => {
    if (amount <= 0) return;
    if ((bal.get(c.id) ?? 0) < amount) ensure(c.id, amount);
    outgoing(c.id, amount);
    stock.push({
      ...stamp(at(date, 18, n.remove++)), id: `demo-stock-${pad(stock.length + 1)}`, date, type: 'remove', classId: c.id, amount,
      unitCost: null, reason, note, voided: false,
    });
  };

  // ---------- clients and their orders ----------
  const clients: Client[] = CLIENTS.map(([name, phone, tags]) => ({
    ...made, id: `demo-client-${name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z]+/g, '-')}`,
    name, phone, notes: name === RENAMED.client ? `Was "${RENAMED.oldName}" until she married.` : '', tags, archived: name === ARCHIVED_CLIENT,
  }));
  // Order days per client: its own rhythm, more often in busy months.
  const due = new Map<number, number[]>();
  CLIENTS.forEach(([, , , from, to, step], ci) => {
    for (let d = from; d >= to; ) {
      (due.get(d) ?? due.set(d, []).get(d)!).push(ci);
      const month = Number(ago(d).slice(5, 7)) - 1;
      d -= Math.max(1, Math.round((step * (0.6 + 0.8 * r())) / SEASON[month]));
    }
  });
  const unsettled = new Map<number, Order[]>(); // 'later' clients: orders not yet paid
  const instalments = new Map<number, { order: Order; amount: number; note: string }[]>(); // payments due per day
  const pay = (clientId: string, orderId: string | null, amount: number, hour: number, note = '', voided = false) => {
    payments.push({
      ...stamp(at(date, hour, n.pay++)), id: `demo-pay-${pad(payments.length + 1)}`, date, clientId, orderId, amount,
      method: methods[payments.length % methods.length], note, voided,
    });
  };
  let doubled = false;
  let mistyped = false;
  let oversold = false;

  const lineFor = (key: string, ci: number, orderId: string, j: number): OrderLine => {
    const { cls, v } = variants.get(key)!;
    const restaurant = CLIENTS[ci][2].includes('restaurant');
    const fixed = v.kind === 'fixed';
    const quantity = fixed ? (1 + Math.floor(r() * 2)) * (restaurant ? 2 : 1) : null;
    let amount = fixed ? quantity! * v.baseAmount! : (restaurant ? 1000 + 50 * Math.floor(r() * 40) : 300 + 50 * Math.floor(r() * 18));
    // Honeycomb once sold beyond what is in stock: it goes negative until the next purchase (§4.3).
    if (key === 'comb' && !oversold && day <= 210) {
      oversold = true;
      amount = Math.max(bal.get(cls.id) ?? 0, 0) + 600;
    } else ensure(cls.id, amount);
    // Cost like the app: the variant cost, else the class average of the day (§3.6b).
    const unitCost = saleUnitCost(v, avg.get(cls.id) ?? null, cls.unit.decimals);
    outgoing(cls.id, amount);
    let unitPrice = day > PRICE_RISE_DAYS ? Math.round((v.price * OLD_PRICE) / 10) * 10 : v.price;
    if (restaurant && !fixed) unitPrice = Math.round(unitPrice * RESTAURANT_DISCOUNT);
    return {
      lineId: `${orderId}-l${j + 1}`, classId: cls.id, variantId: v.id, className: fullName(cls), variantLabel: v.label, kind: v.kind,
      unitName: cls.unit.name, decimals: cls.unit.decimals, quantity, amount, unitPrice, unitCost,
      lineTotal: fixed ? quantity! * unitPrice : roundDiv(amount * unitPrice, 10 ** cls.unit.decimals),
    };
  };

  const placeOrder = (ci: number) => {
    const [, , , , , , pool, policy, gifts] = CLIENTS[ci];
    const client = clients[ci];
    const month = Number(date.slice(5, 7));
    const keys = pool.split(' ').filter((k) => UNTIL[k] === undefined || day > UNTIL[k]);
    const picks = [...new Set(Array.from({ length: 1 + Math.floor(r() * 3) }, () => keys[Math.floor(r() * keys.length)]))];
    const christmas = (month === 12 && Number(date.slice(8, 10)) <= 24) || (month === 11 && Number(date.slice(8, 10)) >= 15);
    if (gifts && christmas && r() < 0.6) picks.push(r() < 0.5 ? 'box' : 'box2');
    const id = `demo-order-${pad(orders.length + 1)}`;
    const lines = picks.map((key, j) => {
      if (key === 'box2') make(deluxe, 1); // made to order
      return lineFor(key, ci, id, j);
    });
    const name = client.name === RENAMED.client && day > RENAMED.since ? RENAMED.oldName : client.name;
    const order: Order = {
      ...stamp(at(date, 10, 9 * n.order++)), id, date, clientId: client.id, clientName: name, lines,
      total: lines.reduce((s, l) => s + l.lineTotal, 0), note: '', voided: false, voidReason: null,
    };
    orders.push(order);
    const payNow = (amount: number) => payments.push({
      ...stamp(at(date, 10, 9 * (n.order - 1) + 1)), id: `demo-pay-${pad(payments.length + 1)}`, date, clientId: client.id, orderId: id,
      amount, method: methods[payments.length % methods.length], note: '', voided: false,
    });
    if (policy === 'now' && !(day <= 2 && r() < 0.5)) payNow(order.total);
    if (policy === 'slow' && day > 120) payNow(order.total);
    if (policy === 'later') (unsettled.get(ci) ?? unsettled.set(ci, []).get(ci)!).push(order);
    if (policy === 'instal') {
      if (order.total < 2000) payNow(order.total);
      else {
        const first = Math.floor(order.total / 200) * 100;
        const second = Math.floor((order.total - first) / 200) * 100;
        payNow(first);
        const plan = second > 0 ? [[14, second], [30, order.total - first - second]] : [[14, order.total - first]];
        for (const [later, amount] of plan) {
          if (day - later < 0) continue;
          (instalments.get(day - later) ?? instalments.set(day - later, []).get(day - later)!).push({ order, amount, note: 'Instalment' });
        }
      }
    }
    // Entered twice by mistake: a voided copy with its voided payment, stock untouched.
    if (!doubled && ci === 0 && day <= 160) {
      doubled = true;
      const copyId = `demo-order-${pad(orders.length + 1)}`;
      orders.push({
        ...order, ...stamp(at(date, 10, 9 * n.order++)), id: copyId, lines: lines.map((l, j) => ({ ...l, lineId: `${copyId}-l${j + 1}` })),
        voided: true, voidReason: 'Entered twice',
      });
      pay(client.id, copyId, order.total, 10, '', true);
    }
  };

  // Running costs: weekly market fee, monthly bills, seasonal and one-off costs.
  const bills = () => {
    const dom = Number(date.slice(8, 10));
    const month = Number(date.slice(5, 7));
    if (new Date(`${date}T00:00:00Z`).getUTCDay() === 6) spend(null, marketFee, 2500);
    if (dom === 1) spend(null, stallRent, 5000);
    if (dom === 1 || dom === 15) spend(gasolinera, fuel, 4000 + Math.floor(r() * 7) * 100);
    if (dom === 5) spend(iberluz, electricity, [9800, 9400, 8200, 7000, 6400, 6800, 7600, 8000, 6900, 7300, 8600, 9900][month - 1]);
    if (dom === 10) spend(null, phone, 2900);
    if (dom === 20) spend(piensos, feed, 11000 + Math.floor(r() * 30) * 100);
    if (dom === 12 && month % 2 === 0) spend(envases, transport, 1800 + Math.floor(r() * 6) * 100);
    if (dom === 15 && (month === 3 || month === 9)) spend(apicola, hiveTreatment, 6000);
    if (dom === 25 && month % 3 === 1) spend(clinica, vet, 4500);
    if (dom === 10 && month === 1) spend(seguros, insurance, 95000);
    if (dom === 10 && month === 7) spend(seguros, insurance, 22000);
  };

  // ---------- the days ----------
  for (day = DEMO_DAYS; day >= 0; day--) {
    date = ago(day);
    n.buy = n.make = n.order = n.pay = n.remove = 0;
    bills();
    if (day === 230) {
      // A new honey extractor; the first entry was typed twice and voided.
      purchase(apicola, [{ lineId: '', classId: equipment.id, className: fullName(equipment), unitName: 'pcs', decimals: 0, amount: 1, lineTotal: 145000 }], true, 'Entered twice');
      spend(apicola, equipment, 145000);
    }
    if (day === 250) make(makers.get(f5.id)!.rec, 10, { voided: true, note: 'Wrong recipe' });
    if (day === 150) make(candleL, 15, { total: 9000, note: 'Costs from the invoice total' });
    for (const ci of due.get(day) ?? []) placeOrder(ci);
    for (const { order, amount, note } of instalments.get(day) ?? []) pay(order.clientId, order.id, amount, 19, note);
    // 'later' clients pay what they owe for orders older than a week, every 30 days.
    for (const [ci, list] of unsettled) {
      if ((CLIENTS[ci][3] - day) % 30 !== 29) continue;
      const settle = list.filter((o) => o.date <= ago(day + 7));
      const amount = settle.reduce((s, o) => s + o.total, 0);
      if (!amount) continue;
      if (!mistyped && ci === 1) {
        mistyped = true;
        pay(clients[ci].id, null, amount * 10, 19, 'Typed one zero too many', true);
      }
      pay(clients[ci].id, null, amount, 19, 'Monthly payment');
      unsettled.set(ci, list.filter((o) => !settle.includes(o)));
    }
    // 'credit' clients pay an advance every 45 days.
    CLIENTS.forEach(([, , , from, , , , policy], ci) => {
      if (policy === 'credit' && day <= from && (from - day) % 45 === 0) pay(clients[ci].id, null, 7000, 9, 'Advance');
    });
    // Stock removes for every reason.
    if (day === 380) remove(f5, 2, 'waste', 'Two jars broke at the market');
    if (day === 300) remove(pollen, 1, 'gift');
    if (day === 200) remove(bottle, 3, 'own use');
    if (day === 120) remove(smallCandle, 1, 'Market sample');
    if (day === 90) remove(lid, 5, 'count correction');
    if (day === 0) {
      // Today ends with propolis sold out (stock count) and the rosemary 1kg jar low after breakage.
      remove(propolis, bal.get(propolis.id)!, 'count correction', 'Shelf count');
      remove(r1, (bal.get(r1.id) ?? 0) - 3, 'waste', 'Broken in transport');
    }
    closeDay();
  }

  const as = (type: RecordType, records: object[]) => records.map((record) => ({ type, record }));
  return [
    ...as('product', products), ...as('client', clients), ...as('order', orders),
    ...as('payment', payments), ...as('stock', stock), ...as('recipe', recipes),
    ...as('supplier', suppliers), ...as('level', levels), ...as('purchase', purchases),
  ];
}

/** Writes the demo records into the store, without outbox entries. */
export function loadDemo(store: Store, today: IsoDate, now: Timestamp): Promise<void> {
  return store.seed(demoRecords(today, now) as { type: RecordType; record: { id: string } }[]);
}
