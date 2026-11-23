// Record types (spec §3). Pure data: every field is JSON-serialisable.

export type Id = string;
/** Whole euro cents. */
export type Cents = number;
/** Cents per unit with up to 4 decimals (D-005); only for unit costs. */
export type UnitCost = number;
/** Amount in a class's base unit × 10^decimals (integer). */
export type Scaled = number;
/** Local calendar date `YYYY-MM-DD`. */
export type IsoDate = string;
/** ISO 8601 UTC timestamp. */
export type Timestamp = string;

export interface Stamped {
  createdAt: Timestamp;
  updatedAt: Timestamp;
  updatedBy: string;
}

export interface RecordBase extends Stamped {
  id: Id;
  schema: number;
}

export type Decimals = 0 | 1 | 2 | 3;

export interface Unit {
  name: string;
  decimals: Decimals;
}

export interface CustomField {
  key: string;
  label: string;
  type: 'text' | 'number';
}

export type VariantKind = 'fixed' | 'variable';

export interface Variant extends Stamped {
  id: Id;
  label: string;
  kind: VariantKind;
  /** Fixed only: scaled base units per item. Null for variable. */
  baseAmount: Scaled | null;
  /** Fixed: cents per item. Variable: cents per 1 base unit. */
  price: Cents;
  /** Same basis as price; null = unknown. */
  cost: UnitCost | null;
  sortOrder: number;
  archived: boolean;
}

export interface ProductClass extends RecordBase {
  name: string;
  unit: Unit;
  lowStockThreshold: Scaled | null;
  trackStock: boolean;
  sellable: boolean;
  customFields: CustomField[];
  customValues: Record<string, string | number>;
  notes: string;
  archived: boolean;
  variants: Variant[];
}

export interface Client extends RecordBase {
  name: string;
  phone: string;
  notes: string;
  tags: string[];
  archived: boolean;
}

export interface OrderLine {
  lineId: Id;
  classId: Id;
  variantId: Id;
  className: string;
  variantLabel: string;
  kind: VariantKind;
  unitName: string;
  decimals: Decimals;
  /** Fixed: item count. Variable: null. */
  quantity: number | null;
  /** Scaled base units sold. */
  amount: Scaled;
  /** Fixed: cents per item. Variable: cents per 1 base unit. */
  unitPrice: Cents;
  /** Fixed: per item. Variable: per 1 base unit. Null = unknown. */
  unitCost: UnitCost | null;
  lineTotal: Cents;
}

export interface Order extends RecordBase {
  date: IsoDate;
  clientId: Id;
  clientName: string;
  lines: OrderLine[];
  total: Cents;
  note: string;
  voided: boolean;
  voidReason: string | null;
}

export type PaymentMethod = 'cash' | 'bizum' | 'other';

export interface Payment extends RecordBase {
  date: IsoDate;
  clientId: Id;
  orderId: Id | null;
  amount: Cents;
  method: PaymentMethod;
  note: string;
  voided: boolean;
}

export interface ClassAmount {
  classId: Id;
  amount: Scaled;
}

export interface StockAdjust extends RecordBase {
  date: IsoDate;
  type: 'add' | 'remove';
  classId: Id;
  amount: Scaled;
  /** Add only: cents per 1 base unit. */
  unitCost: UnitCost | null;
  reason: string;
  note: string;
  voided: boolean;
}

export interface CostExtra {
  label: string;
  amount: Cents;
}

export interface CostShare {
  classId: Id;
  /** Fraction of the total, 0..1; shares of one transform sum to 1. */
  share: number;
}

export interface TransformCosts {
  mode: 'breakdown' | 'total';
  materials: Cents;
  materialsComplete: boolean;
  extras: CostExtra[];
  total: Cents;
  allocation: CostShare[];
}

export interface StockTransform extends RecordBase {
  date: IsoDate;
  type: 'transform';
  inputs: ClassAmount[];
  outputs: ClassAmount[];
  recipeId: Id | null;
  costs: TransformCosts | null;
  note: string;
  voided: boolean;
}

export type StockEvent = StockAdjust | StockTransform;

export interface Recipe extends RecordBase {
  name: string;
  inputs: ClassAmount[];
  outputs: ClassAmount[];
  /** Optional defaults for the transform costs (§3.6a). */
  extras: CostExtra[];
  shares: CostShare[];
  archived: boolean;
}

export type RecordType = 'product' | 'client' | 'order' | 'payment' | 'stock' | 'recipe';

export const SCHEMA_VERSION = 1;
