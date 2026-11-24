<script lang="ts">
  import { formatMoney } from '../../../core/money.ts';
  import { lineSummary } from '../../../core/orders.ts';
  import { oldestUnpaidDays, orderState } from '../../../core/payments.ts';
  import { formatAmount } from '../../../core/quantity.ts';
  import { clientStats, unitsBought } from '../../../core/stats.ts';
  import type { Decimals } from '../../../core/types.ts';
  import { app, localDate, saveClient, view } from '../../data.svelte.ts';
  import ConfirmSheet from '../../components/ConfirmSheet.svelte';
  import EmptyState from '../../components/EmptyState.svelte';
  import Header from '../../components/Header.svelte';
  import Icon from '../../components/Icon.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import StatusTag from '../../components/StatusTag.svelte';
  import { liveName } from '../stock/grouping.ts';
  import ClientSheet from './ClientSheet.svelte';
  import MergeSheet from './MergeSheet.svelte';
  import ReceiveSheet from './ReceiveSheet.svelte';
  import { shortDate } from './logic.ts';

  let { params = {} }: { params?: Record<string, string>; query?: Record<string, string> } = $props();

  const client = $derived(view.clientsById.get(params.id ?? ''));
  const balance = $derived(client ? view.balances.get(client.id) : undefined);
  const today = localDate();
  const orders = $derived(
    app.orders
      .filter((o) => o.clientId === client?.id && !o.voided)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
  );
  const owed = $derived(balance?.owed ?? 0);
  const credit = $derived(balance?.credit ?? 0);
  const unpaidCount = $derived(orders.filter((o) => orderState(balance, o).owed > 0).length);
  const oldest = $derived(balance ? oldestUnpaidDays(balance, orders, today) : null);
  const stats = $derived(client ? clientStats(app.orders, view.balances, client.id, today) : null);
  const bought = $derived(client ? unitsBought(app.orders, client.id) : []);

  let menu = $state(false);
  let editing = $state(false);
  let receiving = $state(false);
  let markAll = $state(false);
  let archiving = $state(false);
  let merging = $state(false);

  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const pick = (fn: () => void) => {
    menu = false;
    fn();
  };

  async function toggleArchive() {
    if (client) await saveClient({ ...client, archived: !client.archived });
  }
</script>

{#if !client}
  <Header title="Client" back="#/clients" />
  <div class="page"><EmptyState title="Client not found" /></div>
{:else}
  <Header title={client.name + (client.archived ? ' (archived)' : '')} back="#/clients">
    {#snippet actions()}
      <button type="button" class="icon-btn" aria-label="Client menu" onclick={() => (menu = true)}><Icon name="more" /></button>
    {/snippet}
  </Header>

  <div class="page">
    {#if client.phone || client.notes || client.tags.length}
      <div class="info">
        {#if client.phone}<a href="tel:{client.phone}">{client.phone}</a>{/if}
        {#if client.notes}<span class="muted">{client.notes}</span>{/if}
        {#if client.tags.length}<span class="muted">{client.tags.join(' · ')}</span>{/if}
      </div>
    {/if}

    <section class="balance" class:owing={owed > 0} class:has-credit={owed <= 0 && credit > 0}>
      {#if owed > 0}
        <span class="small">Owes</span>
        <span class="big">{formatMoney(owed)}</span>
        <span class="small">
          {plural(unpaidCount, 'order')}{oldest !== null ? ` · oldest unpaid ${plural(oldest, 'day')}` : ''}
        </span>
      {:else if credit > 0}
        <span class="small">Credit</span>
        <span class="big">{formatMoney(credit)}</span>
        <span class="small">Credit {formatMoney(credit)}, used on their next order</span>
      {:else}
        <span class="big">Settled</span>
      {/if}
      <div class="btns">
        <button type="button" class="btn btn-primary" onclick={() => (receiving = true)}>Receive payment</button>
        {#if owed > 0}
          <button type="button" class="btn" onclick={() => (markAll = true)}>Mark all paid</button>
        {/if}
      </div>
    </section>

    <a class="btn btn-primary btn-block" href="#/orders/new?client={client.id}">New order for {client.name}</a>

    {#if bought.length}
      <section class="card">
        <h2>Units bought (all time)</h2>
        <div class="tiles">
          {#each bought as b (b.variantId)}
            <div class="tile">
              <span class="n">{b.quantity !== null ? b.quantity : formatAmount(b.amount, b.decimals as Decimals, b.unitName)}</span>
              <span class="muted">{liveName(view.classesById, b.classId, b.className)} · {b.label}</span>
            </div>
          {/each}
        </div>
      </section>
    {/if}

    {#if stats && stats.orderCount > 0}
      <section class="card">
        <h2>Stats</h2>
        <div class="row-between"><span class="muted">Total spent</span><span class="amount">{formatMoney(stats.totalSpent)}</span></div>
        <div class="row-between">
          <span class="muted">Average days to pay</span>
          <span class="amount">{stats.avgDaysToPay === null ? '—' : Math.round(stats.avgDaysToPay)}</span>
        </div>
        <div class="row-between"><span class="muted">First order</span><span class="amount">{stats.firstOrder ? shortDate(stats.firstOrder) : '—'}</span></div>
        <div class="row-between"><span class="muted">Last order</span><span class="amount">{stats.lastOrder ? shortDate(stats.lastOrder) : '—'}</span></div>
      </section>
    {/if}

    <section>
      <h2>Orders</h2>
      {#if orders.length === 0}
        <EmptyState title="No orders yet" />
      {:else}
        <div class="card list">
          {#each orders as o (o.id)}
            {@const st = orderState(balance, o)}
            <a class="list-row" href="#/orders/{o.id}">
              <span class="grow">
                <span class="row-between"><span class="muted">{shortDate(o.date)}</span><StatusTag status={st.status} /></span>
                <span>{lineSummary(o.lines)}</span>
                <span class="row-between">
                  <span class="muted">Total {formatMoney(o.total)}</span>
                  {#if st.owed > 0}<span class="amount owed-text">Owes {formatMoney(st.owed)}</span>{/if}
                </span>
              </span>
            </a>
          {/each}
        </div>
      {/if}
    </section>
  </div>

  <Sheet bind:open={menu} title={client.name}>
    <button type="button" class="list-row" onclick={() => pick(() => (editing = true))}><Icon name="edit" /> Edit</button>
    <button type="button" class="list-row" onclick={() => pick(() => (merging = true))}><Icon name="transform" /> Merge into…</button>
    <button type="button" class="list-row" onclick={() => pick(() => (archiving = true))}>
      <Icon name="archive" /> {client.archived ? 'Unarchive' : 'Archive'}
    </button>
  </Sheet>

  <ClientSheet bind:open={editing} {client} />
  <ReceiveSheet bind:open={receiving} {client} />
  <ReceiveSheet bind:open={markAll} {client} fixed />
  <MergeSheet bind:open={merging} {client} />
  <ConfirmSheet
    bind:open={archiving}
    title={client.archived ? `Unarchive ${client.name}?` : `Archive ${client.name}?`}
    confirmLabel={client.archived ? 'Unarchive' : 'Archive'}
    onconfirm={toggleArchive}
  >
    <p class="hint">
      {client.archived
        ? 'They will show in the client list and order form again.'
        : 'They are hidden from the client list and new orders. Their orders and payments stay valid.'}
    </p>
  </ConfirmSheet>
{/if}

<style>
  .info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 0 4px;
  }
  .balance {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 18px;
    border-radius: var(--radius-hero);
    border: 1px solid var(--border);
    background: var(--chip);
    color: var(--ink);
  }
  .balance.owing {
    background: var(--owed-bg);
    border-color: var(--owed-mid);
    color: var(--owed-on-bg);
  }
  .balance.has-credit {
    background: var(--accent-soft);
    border-color: var(--accent);
    color: var(--accent-strong);
  }
  .big {
    font-size: 36px;
    font-weight: 700;
    letter-spacing: -0.03em;
  }
  .small {
    font-size: var(--fs-small);
  }
  .btns {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 8px;
    margin-top: 8px;
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .tile {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px 12px;
    border-radius: var(--radius-control);
    background: var(--chip);
  }
  .n {
    font-size: 22px;
    font-weight: 700;
  }
  .icon-btn {
    display: inline-grid;
    place-items: center;
    width: var(--tap);
    height: var(--tap);
    border: 0;
    background: none;
    color: var(--ink);
  }
</style>
