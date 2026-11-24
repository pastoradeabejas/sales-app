<script lang="ts">
  import Avatar from '../../components/Avatar.svelte';
  import ConfirmSheet from '../../components/ConfirmSheet.svelte';
  import EmptyState from '../../components/EmptyState.svelte';
  import Header from '../../components/Header.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import Segmented from '../../components/Segmented.svelte';
  import SearchField from '../../components/SearchField.svelte';
  import StatusTag from '../../components/StatusTag.svelte';
  import { buildTree, fullName } from '../../../core/groups.ts';
  import { formatMoney, parseMoney } from '../../../core/money.ts';
  import { isFutureDate, orderTotal, startFromPicks, unitSummary, validateOrder } from '../../../core/orders.ts';
  import { newOrderPayment, previewNewOrder } from '../../../core/payments.ts';
  import { formatAmount } from '../../../core/quantity.ts';
  import { stockWarnings } from '../../../core/stock.ts';
  import type { Id, Order, PaymentMethod } from '../../../core/types.ts';
  import { app, freshRecord, localDate, newId, saveOrder, undoToast, view } from '../../data.svelte.ts';
  import { go } from '../../router.svelte.ts';
  import { showToast } from '../../toast.svelte.ts';
  import GroupHeader from '../stock/GroupHeader.svelte';
  import { flattenTree, loadCollapsed, saveCollapsed, toggleCollapsed } from '../stock/grouping.ts';
  import Balance from './Balance.svelte';
  import ClientPicker from './ClientPicker.svelte';
  import StartFrom from './StartFrom.svelte';
  import VariantRow from './VariantRow.svelte';
  import { dateButtonLabel } from './polish.ts';
  import {
    addedGroups,
    creditMoved,
    draftFromOrder,
    draftLines,
    pickerGroups,
    productGroups,
    shortDay,
    skippedNote,
    stockDelta,
    stockWarningText,
    variantIndex,
    type Draft,
  } from './logic.ts';

  let { params = {}, query = {} }: { params?: Record<string, string>; query?: Record<string, string> } = $props();

  type PayStatus = 'unpaid' | 'partial' | 'paid';
  const today = localDate();
  // The edited order as it was when the form opened (the route is keyed, so this runs once per order).
  // svelte-ignore state_referenced_locally
  const prev: Order | undefined = params.route === 'order-edit' ? $state.snapshot(view.ordersById.get(params.id ?? '')) : undefined;
  // svelte-ignore state_referenced_locally
  const missing = params.route === 'order-edit' && (!prev || prev.voided);
  const emptyDraft = (): Draft => ({ qty: {}, prices: {} });

  let clientId = $state<Id>(prev?.clientId ?? '');
  let step = $state<'client' | 'start' | 'form'>(prev ? 'form' : 'client');
  let date = $state(prev?.date ?? today);
  let note = $state(prev?.note ?? '');
  let draft = $state<Draft>(prev ? draftFromOrder(prev, view.classesById, false).draft : emptyDraft());
  let startedFrom = $state<Order | null>(null);
  let skipped = $state<string[]>([]);
  let pay = $state<PayStatus>('unpaid');
  let paidNowText = $state('');
  let method = $state<PaymentMethod>(app.settings.lastPaymentMethod ?? 'cash');
  let errors = $state<string[]>([]);
  let warnOpen = $state(false);
  let warnText = $state('');
  let busy = $state(false);
  let dateOpen = $state(false);
  // Only the products added to this order are listed; "+ Add product" picks more (D-026).
  const withQty = (d: Draft) => Object.keys(d.qty).filter((id) => (d.qty[id] ?? 0) > 0);
  // svelte-ignore state_referenced_locally
  let added = $state(new Set<Id>([...(prev?.lines.map((l) => l.variantId) ?? []), ...withQty(draft)]));
  let pickOpen = $state(false);
  let pickText = $state('');

  const client = $derived(view.clientsById.get(clientId));
  const picks = $derived(clientId ? startFromPicks(app.orders, clientId) : []);
  const index = $derived(variantIndex(app.products));
  const include = $derived(new Set([...(prev?.lines.map((l) => l.variantId) ?? []), ...Object.keys(draft.qty)]));
  const groups = $derived(productGroups(app.products, app.orders, include));
  const shown = $derived(addedGroups(groups, added));
  const tree = $derived(buildTree(shown.map((g) => ({ name: g.cls.name, group: g.cls.group, g }))));
  const pickList = $derived(pickerGroups(groups, pickText));
  let collapsed = $state(loadCollapsed(localStorage, 'orderCollapsed'));
  const rows = $derived(
    flattenTree(tree, {
      collapsed,
      force: (x) => x.g.variants.some((v) => (draft.qty[v.id] ?? 0) > 0),
      order: (a, b) => shown.indexOf(a.g) - shown.indexOf(b.g),
    }),
  );
  function toggle(path: string) {
    collapsed = toggleCollapsed(collapsed, path);
    saveCollapsed(localStorage, 'orderCollapsed', collapsed);
  }
  const avgCost = (classId: Id) => view.snapshot.get(classId)?.avgCost ?? null;
  const lines = $derived(draftLines(draft, index, avgCost, () => '', prev));
  const total = $derived(orderTotal(lines));
  const balance = $derived(view.balances.get(clientId));
  const credit = $derived(prev ? 0 : (balance?.credit ?? 0));
  const paidNow = $derived(parseMoney(paidNowText));
  const payment = $derived(newOrderPayment({ status: pay, total, credit, paidNow: paidNow ?? 0 }));
  const preview = $derived(previewNewOrder(prev ? undefined : balance, total, payment));
  const hasLines = $derived(Object.values(draft.qty).some((n) => n > 0));

  const payOptions: { value: PayStatus; label: string }[] = [
    { value: 'unpaid', label: 'Unpaid' },
    { value: 'partial', label: 'Partial' },
    { value: 'paid', label: 'Paid' },
  ];
  const methodOptions: { value: PaymentMethod; label: string }[] = [
    { value: 'cash', label: 'Cash' },
    { value: 'bizum', label: 'Bizum' },
    { value: 'other', label: 'Other' },
  ];

  // ?client=<id> starts with that client chosen.
  // svelte-ignore state_referenced_locally
  if (!prev && query.client && view.clientsById.has(query.client)) choose(query.client, false);

  function choose(id: Id, isNew: boolean) {
    clientId = id;
    if (isNew || hasLines || prev) step = 'form';
    else step = startFromPicks(app.orders, id).length ? 'start' : 'form';
  }

  function use(o: Order) {
    const r = draftFromOrder(o, view.classesById, true);
    draft = r.draft;
    added = new Set(withQty(r.draft));
    skipped = r.skipped;
    startedFrom = o;
    step = 'form';
  }

  function custom() {
    draft = emptyDraft();
    added = new Set();
    skipped = [];
    startedFrom = null;
    step = 'form';
  }

  function addVariant(v: { id: Id; kind: string }) {
    added = new Set([...added, v.id]);
    if (v.kind === 'fixed' && !(draft.qty[v.id] > 0)) draft.qty[v.id] = 1;
    pickOpen = false;
    pickText = '';
  }

  function stockText(classId: Id): string {
    const cls = view.classesById.get(classId);
    if (!cls?.trackStock) return '';
    return `${formatAmount(view.snapshot.get(classId)?.stock ?? 0, cls.unit.decimals, cls.unit.name)} in stock`;
  }

  async function save(confirmed = false) {
    const built = draftLines(draft, index, avgCost, newId, prev);
    const order: Order = prev
      ? { ...prev, clientId, date, note: note.trim(), lines: built, total: orderTotal(built) }
      : {
          ...freshRecord(),
          date,
          clientId,
          clientName: client?.name ?? '',
          lines: built,
          total: orderTotal(built),
          note: note.trim(),
          voided: false,
          voidReason: null,
        };
    const errs = validateOrder(order);
    if (!prev && pay === 'partial' && !(paidNow && paidNow > 0)) errs.push('Enter the amount paid now');
    errors = errs;
    if (errs.length) return;
    if (!confirmed) {
      const warnings = stockWarnings(stockDelta(built, prev?.lines), view.snapshot);
      if (warnings.length) {
        warnText = stockWarningText(warnings, view.classesById);
        warnOpen = true;
        return;
      }
    }
    busy = true;
    try {
      const moved = prev ? creditMoved(app.orders, app.payments, order) : 0;
      const movedTo = prev ? (view.clientsById.get(prev.clientId)?.name ?? prev.clientName) : '';
      const saved = await saveOrder(order, prev || payment === 0 ? undefined : { amount: payment, method });
      go(`#/orders/${saved.id}`, true);
      if (!prev) undoToast('Order saved', saved.id);
      else showToast(moved > 0 ? `${formatMoney(moved)} moved to ${movedTo}'s credit` : 'Order updated');
    } finally {
      busy = false;
    }
  }
</script>

<Header title={prev ? 'Edit order' : 'New order'} back={prev ? `#/orders/${prev.id}` : '#/orders'}>
  {#snippet actions()}
    {#if step === 'form' && !missing}
      <button type="button" class="btn date-btn" aria-label="Order date" onclick={() => (dateOpen = true)}>
        {dateButtonLabel(date, today)}
      </button>
    {/if}
  {/snippet}
</Header>

{#if missing}
  <div class="page">
    <EmptyState title="This order can't be edited">
      <p>It was not found or it is voided.</p>
      <a class="btn" href="#/orders">Back to orders</a>
    </EmptyState>
  </div>
{:else if step === 'client'}
  <div class="page">
    <ClientPicker selectedId={clientId} onpick={choose} />
  </div>
{:else if step === 'start'}
  <div class="page">
    <section class="card client">
      <Avatar name={client?.name ?? ''} size={36} />
      <span class="grow title">{client?.name}</span>
      <button type="button" class="btn btn-ghost" onclick={() => (step = 'client')}>Change</button>
    </section>
    <StartFrom {clientId} {picks} onuse={use} oncustom={custom} />
  </div>
{:else}
  <div class="page">
    <section class="card client">
      <Avatar name={client?.name ?? prev?.clientName ?? ''} size={36} />
      <span class="grow">
        <span class="title">{client?.name ?? prev?.clientName}{client?.archived ? ' (archived)' : ''}</span>
        <Balance {clientId} />
      </span>
      <button type="button" class="btn btn-ghost" onclick={() => (step = 'client')}>Change</button>
    </section>
    {#if startedFrom}
      <button type="button" class="link" onclick={() => (step = 'start')}>
        Started from {client?.name}'s order of {shortDay(startedFrom.date, today)} · Change
      </button>
    {/if}
    {#if skipped.length}<p class="warning">{skippedNote(skipped)}</p>{/if}

    {#if groups.length === 0}
      <EmptyState title="No products to sell">
        <p>Add a product class with variants first.</p>
        <a class="btn" href="#/products">Products</a>
      </EmptyState>
    {/if}
    {#each rows as r (r.kind === 'group' ? `g:${r.node.path}` : r.item.g.cls.id)}
      {#if r.kind === 'group'}
        <GroupHeader name={r.node.name} count={r.node.count} open={r.open} depth={r.depth} ontoggle={() => toggle(r.node.path)} />
      {:else}
      {@const g = r.item.g}
      <section class="card group" style:margin-left="{r.depth * 12}px">
        <div class="section-head">
          <h2>{g.cls.name}</h2>
          <span class="muted">{stockText(g.cls.id)}</span>
        </div>
        {#each g.variants as v (v.id)}
          <VariantRow
            cls={g.cls}
            variant={v}
            qty={draft.qty[v.id] ?? 0}
            price={draft.prices[v.id] ?? v.price}
            onqty={(n) => (draft.qty[v.id] = n)}
            onprice={(c) => (draft.prices[v.id] = c)}
          />
        {/each}
      </section>
      {/if}
    {/each}
    {#if groups.length}
      <button type="button" class="btn btn-block add-product" onclick={() => (pickOpen = true)}>+ Add product</button>
      {#if shown.length}<p class="hint">Tap a price to change it for this order only.</p>{/if}
    {/if}

    <div class="field">
      <label for="order-note">Note</label>
      <input id="order-note" class="input" bind:value={note} placeholder="Optional" autocomplete="off" />
    </div>
  </div>

  <footer class="sticky-footer">
    <div class="row-between">
      <span class="muted">{unitSummary(lines) || 'No items yet'}</span>
      <span class="total">{formatMoney(total)}</span>
    </div>
    {#if !prev}
      <Segmented options={payOptions} bind:value={pay} label="Payment" />
      {#if pay === 'partial'}
        <div class="paid-now">
          <label for="paid-now">Paid now €</label>
          <input id="paid-now" class="input" inputmode="decimal" autocomplete="off" bind:value={paidNowText} placeholder="0.00" />
        </div>
      {/if}
      {#if pay !== 'unpaid'}
        <Segmented options={methodOptions} bind:value={method} label="Payment method" />
      {/if}
      {#if preview.creditUsed > 0}
        <div class="row-between credit">
          <span class="credit-text">{formatMoney(preview.creditUsed)} credit will be used</span>
          <StatusTag status={preview.status} />
        </div>
      {/if}
    {/if}
    {#if errors.length}
      <ul class="errors" role="alert">
        {#each errors as e (e)}<li class="error">{e}</li>{/each}
      </ul>
    {/if}
    <button type="button" class="btn btn-primary btn-block" disabled={busy} onclick={() => save()}>
      {prev ? 'Save changes' : 'Save order'}
    </button>
  </footer>
{/if}

<Sheet bind:open={pickOpen} title="Add product">
  <SearchField bind:value={pickText} label="Search products" placeholder="Search product or size" />
  <div class="pick-list">
    {#each pickList as g (g.cls.id)}
      <section>
        <h3>{fullName(g.cls)} <span class="muted">{stockText(g.cls.id)}</span></h3>
        {#each g.variants as v (v.id)}
          <button type="button" class="pick" class:on={added.has(v.id)} onclick={() => addVariant(v)}>
            <span class="grow">{v.label}</span>
            <span class="muted">{formatMoney(v.price)}{v.kind === 'variable' ? `/${g.cls.unit.name}` : ''}</span>
          </button>
        {/each}
      </section>
    {:else}
      <p class="muted">No products match.</p>
    {/each}
  </div>
</Sheet>

<Sheet bind:open={dateOpen} title="Order date">
  <div class="field">
    <label for="order-date">Date</label>
    <input id="order-date" class="input" type="date" bind:value={date} />
    {#if isFutureDate(date, today)}<p class="warning">This date is in the future.</p>{/if}
  </div>
  {#snippet footer()}
    <button type="button" class="btn btn-primary btn-block" onclick={() => (dateOpen = false)}>Done</button>
  {/snippet}
</Sheet>

<ConfirmSheet bind:open={warnOpen} title="Stock below zero" confirmLabel="Save anyway" onconfirm={() => save(true)}>
  <p>{warnText}</p>
</ConfirmSheet>

<style>
  .add-product {
    font-weight: 600;
  }
  .pick-list {
    display: grid;
    gap: 12px;
    margin-top: 12px;
  }
  .pick-list h3 {
    margin: 0 0 4px;
    font-size: var(--fs-small);
    font-weight: 600;
  }
  .pick {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: var(--tap);
    padding: 0 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    text-align: left;
    margin-bottom: 6px;
  }
  .pick.on {
    border-color: var(--accent);
  }
  .date-btn {
    min-height: var(--tap);
    font-size: var(--fs-small);
    white-space: nowrap;
  }
  .client {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 8px 8px 14px;
  }
  .link {
    justify-self: start;
    min-height: var(--tap);
    padding: 0 4px;
    border: 0;
    background: none;
    color: var(--accent);
    font-weight: 600;
    font-size: 14px;
    text-align: left;
  }
  .group {
    padding: 6px 16px;
  }
  .group .section-head {
    margin: 10px 0 4px;
  }
  .group h2 {
    margin: 0;
    font-size: var(--fs-body);
  }
  .total {
    font-size: 24px;
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  .paid-now {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .paid-now label {
    font-size: var(--fs-small);
    font-weight: 600;
    color: var(--muted);
    white-space: nowrap;
  }
  .paid-now .input {
    max-width: 140px;
  }
  .credit {
    align-items: center;
    font-size: var(--fs-small);
    font-weight: 600;
  }
  .errors {
    margin: 0;
    padding: 0 0 0 18px;
  }
</style>
