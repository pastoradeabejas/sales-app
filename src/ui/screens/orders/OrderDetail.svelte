<script lang="ts">
  import Avatar from '../../components/Avatar.svelte';
  import ConfirmSheet from '../../components/ConfirmSheet.svelte';
  import EmptyState from '../../components/EmptyState.svelte';
  import Header from '../../components/Header.svelte';
  import Icon from '../../components/Icon.svelte';
  import StatusTag from '../../components/StatusTag.svelte';
  import Tag from '../../components/Tag.svelte';
  import { formatMoney } from '../../../core/money.ts';
  import { orderState, paidFromCredit } from '../../../core/payments.ts';
  import { formatAmount } from '../../../core/quantity.ts';
  import type { OrderLine, Payment, PaymentMethod } from '../../../core/types.ts';
  import { app, view, voidPayment } from '../../data.svelte.ts';
  import { showToast } from '../../toast.svelte.ts';
  import { formatDay } from './logic.ts';
  import PaymentSheet from './PaymentSheet.svelte';
  import VoidSheet from './VoidSheet.svelte';

  let { params = {} }: { params?: Record<string, string>; query?: Record<string, string> } = $props();

  const order = $derived(view.ordersById.get(params.id ?? ''));
  const client = $derived(order ? view.clientsById.get(order.clientId) : undefined);
  const ps = $derived(order ? orderState(view.balances.get(order.clientId), order) : undefined);
  const payments = $derived(
    order ? app.payments.filter((p) => p.orderId === order.id && !p.voided).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)) : [],
  );
  const linkedSum = $derived(payments.reduce((s, p) => s + p.amount, 0));
  const fromCredit = $derived(ps ? paidFromCredit(ps) : 0);
  const paidPct = $derived(ps && ps.total > 0 ? Math.min(100, (ps.paid / ps.total) * 100) : 100);

  let paySheet = $state(false);
  let voidSheet = $state(false);
  let voidPay = $state<Payment | null>(null);
  let voidPayOpen = $state(false);

  const methodLabel: Record<PaymentMethod, string> = { cash: 'Cash', bizum: 'Bizum', other: 'Other' };

  function archived(l: OrderLine): boolean {
    const cls = view.classesById.get(l.classId);
    return !!cls && (cls.archived || !!cls.variants.find((v) => v.id === l.variantId)?.archived);
  }

  function qtyText(l: OrderLine): string {
    return l.kind === 'fixed'
      ? `${l.quantity} × ${formatMoney(l.unitPrice)}`
      : `${formatAmount(l.amount, l.decimals, l.unitName, { fixed: true })} × ${formatMoney(l.unitPrice)}/${l.unitName}`;
  }

  function askVoidPayment(p: Payment) {
    voidPay = p;
    voidPayOpen = true;
  }

  async function confirmVoidPayment() {
    if (!voidPay) return;
    await voidPayment(voidPay.id);
    showToast('Payment voided');
  }
</script>

<Header title="Order" back="#/orders" />

{#if !order || !ps}
  <div class="page">
    <EmptyState title="Order not found">
      <a class="btn" href="#/orders">Back to orders</a>
    </EmptyState>
  </div>
{:else}
  <div class="page">
    <section class="card head">
      <a class="who" href="#/clients/{order.clientId}">
        <Avatar name={client?.name ?? order.clientName} />
        <span class="grow">
          <span class="title">{client?.name ?? order.clientName}{client?.archived ? ' (archived)' : ''}</span>
          <span class="muted">{formatDay(order.date, true)} · {order.updatedBy}</span>
        </span>
      </a>
      <StatusTag status={ps.status} />
    </section>

    {#if order.voided}
      <p class="warning">Voided{order.voidReason ? `: ${order.voidReason}` : ''}. This order no longer counts in totals, stock or stats.</p>
    {/if}

    <section class="card items">
      <h2>Items</h2>
      <div class="grid head-row muted">
        <span>Product</span><span class="r">Qty × price</span><span class="r">Total</span>
      </div>
      {#each order.lines as l (l.lineId)}
        <div class="grid line">
          <span class="product">
            {l.className} {l.variantLabel}
            {#if archived(l)}<Tag tone="neutral">archived</Tag>{/if}
          </span>
          <span class="r">{qtyText(l)}</span>
          <span class="r strong">{formatMoney(l.lineTotal)}</span>
        </div>
      {/each}
      <div class="row-between total"><span>Total</span><span>{formatMoney(order.total)}</span></div>
      {#if order.note}<p class="muted note">{order.note}</p>{/if}
    </section>

    {#if !order.voided}
      <section class="card pays">
        <h2>Payments</h2>
        {#each payments as p (p.id)}
          <div class="list-row">
            <span class="grow">
              <span>{methodLabel[p.method]}</span>
              <span class="muted">{formatDay(p.date)}</span>
            </span>
            <span class="amount">{formatMoney(p.amount)}</span>
            <button type="button" class="icon-btn" aria-label="Payment options" onclick={() => askVoidPayment(p)}><Icon name="more" /></button>
          </div>
        {/each}
        {#if fromCredit > 0}
          <div class="list-row">
            <span class="grow">Paid from credit</span>
            <span class="amount">{formatMoney(fromCredit)}</span>
          </div>
        {/if}
        {#if !payments.length && fromCredit === 0}<p class="hint none">No payments yet.</p>{/if}
        <div class="summary">
          <div class="bar" aria-hidden="true"><span style:width="{paidPct}%"></span></div>
          <div class="row-between">
            <span class="muted">Paid {formatMoney(ps.paid)} of {formatMoney(ps.total)}</span>
            {#if ps.owed > 0}
              <span class="amount owed-text">Owes {formatMoney(ps.owed)}</span>
            {:else}
              <span class="amount credit-text">Fully paid</span>
            {/if}
          </div>
        </div>
      </section>

      <section class="actions">
        <button type="button" class="btn btn-primary btn-block" onclick={() => (paySheet = true)}>
          Add payment{ps.owed > 0 ? ` · ${formatMoney(ps.owed)}` : ''}
        </button>
        <div class="two">
          <a class="btn" href="#/orders/{order.id}/edit">Edit order</a>
          <button type="button" class="btn btn-danger" onclick={() => (voidSheet = true)}>Void order</button>
        </div>
      </section>

      <PaymentSheet bind:open={paySheet} {order} owed={ps.owed} />
      <VoidSheet bind:open={voidSheet} orderId={order.id} linked={linkedSum} />
    {/if}
  </div>
{/if}

<ConfirmSheet bind:open={voidPayOpen} title="Void payment" confirmLabel="Void payment" danger onconfirm={confirmVoidPayment}>
  {#if voidPay}
    <p>Void the {methodLabel[voidPay.method].toLowerCase()} payment of {formatMoney(voidPay.amount)} from {formatDay(voidPay.date)}? A voided payment no longer counts.</p>
  {/if}
</ConfirmSheet>

<style>
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .who {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    color: var(--ink);
    text-decoration: none;
  }
  .items,
  .pays {
    padding: 6px 16px 14px;
  }
  .items h2,
  .pays h2 {
    margin: 10px 0 6px;
    font-size: var(--fs-body);
  }
  .grid {
    display: grid;
    grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr) minmax(0, 0.8fr);
    gap: 8px;
    align-items: start;
  }
  .head-row {
    font-size: 12px;
    padding-bottom: 6px;
  }
  .line {
    padding: 10px 0;
    border-top: 1px solid var(--divider);
  }
  .product {
    font-weight: 500;
    overflow-wrap: anywhere;
  }
  .r {
    text-align: right;
  }
  .strong {
    font-weight: 600;
  }
  .total {
    padding-top: 10px;
    border-top: 1px solid var(--border);
    font-size: 16px;
    font-weight: 700;
  }
  .note {
    margin: 10px 0 0;
  }
  .none {
    padding: 10px 0;
  }
  .icon-btn {
    display: inline-grid;
    place-items: center;
    width: var(--tap);
    height: var(--tap);
    border: 0;
    background: none;
    color: var(--muted);
    border-radius: var(--radius-control);
  }
  .summary {
    display: grid;
    gap: 6px;
    padding-top: 10px;
    border-top: 1px solid var(--border);
  }
  .bar {
    display: flex;
    height: 10px;
    border-radius: 999px;
    overflow: hidden;
    background: var(--owed-bar);
  }
  .bar span {
    background: var(--accent);
  }
  .actions {
    display: grid;
    gap: 8px;
  }
  .two {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
</style>
