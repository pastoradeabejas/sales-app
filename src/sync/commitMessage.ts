// Commit messages (§6.2) and conflict toasts (§6.4) for record pushes.
import { formatMoney } from '../core/money.ts';
import { fullName } from '../core/groups.ts';
import { lineSummary } from '../core/orders.ts';
import { formatAmount } from '../core/quantity.ts';
import type { ClassAmount, RecordType } from '../core/types.ts';
import type { OutboxEntry, StoreName } from '../store/store.ts';

/** Reads a record by store and id (store.get in the app). */
export type Lookup = (store: StoreName, id: string) => Promise<any>;

const nameOf = async (lookup: Lookup, store: StoreName, id: string) => (await lookup(store, id))?.name ?? id;

async function side(lookup: Lookup, items: ClassAmount[], sign: '+' | '−') {
  const parts = await Promise.all(items.map(async ({ classId, amount }) => {
    const cls = await lookup('products', classId);
    return `${cls ? fullName(cls) : classId} ${sign}${formatAmount(amount, cls?.unit.decimals ?? 0, cls?.unit.name)}`;
  }));
  return parts.join(', ');
}

/** "<action>: <summary>" of a record. */
async function describe(type: RecordType, r: any, lookup: Lookup): Promise<[string, string]> {
  const v = r.voided ? ' void' : '';
  switch (type) {
    case 'order':
      return [`order${v}`, `${r.clientName}, ${lineSummary(r.lines)} (${formatMoney(r.total)})`];
    case 'payment':
      return [`payment${v}`, `${await nameOf(lookup, 'clients', r.clientId)} ${formatMoney(r.amount)} (${r.method})`];
    case 'stock':
      if (r.type === 'transform') return [`transform${v}`, `${await side(lookup, r.inputs, '−')} → ${await side(lookup, r.outputs, '+')}`];
      return [`stock ${r.type}${v}`, await side(lookup, [r], r.type === 'add' ? '+' : '−')];
    default:
      return [type, fullName(r)];
  }
}

/** `[Phone A] order: Marta, 2× Parmigiano Reggiano 500 g (€28.00)`. */
export async function commitMessage(deviceName: string, entry: Pick<OutboxEntry, 'recordType' | 'content'>, lookup: Lookup): Promise<string> {
  const [action, summary] = await describe(entry.recordType, entry.content, lookup);
  return `[${deviceName}] ${action}: ${summary}`;
}

/** "Marta's order was changed on Phone B; showing the latest version" for the winning remote record. */
export async function conflictToast(type: RecordType, winner: any, lookup: Lookup): Promise<string> {
  const what = type === 'order' ? `${winner.clientName}'s order`
    : type === 'payment' ? `${await nameOf(lookup, 'clients', winner.clientId)}'s payment`
    : type === 'stock' ? (winner.type === 'transform' ? 'A transform' : `A stock ${winner.type}`)
    : winner.name;
  return `${what} was changed on ${winner.updatedBy}; showing the latest version`;
}
