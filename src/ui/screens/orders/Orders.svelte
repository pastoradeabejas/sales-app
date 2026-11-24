<script lang="ts">
  import Chips from '../../components/Chips.svelte';
  import EmptyState from '../../components/EmptyState.svelte';
  import Header from '../../components/Header.svelte';
  import TabSwitch from '../../components/TabSwitch.svelte';
  import SearchField from '../../components/SearchField.svelte';
  import StatusTag from '../../components/StatusTag.svelte';
  import { formatMoney } from '../../../core/money.ts';
  import { lineSummary } from '../../../core/orders.ts';
  import { orderState } from '../../../core/payments.ts';
  import type { Order } from '../../../core/types.ts';
  import { app, localDate, view } from '../../data.svelte.ts';
  import { filterOrders, groupByDay, newestMonths, type StatusFilter } from './logic.ts';

  let {}: { params?: Record<string, string>; query?: Record<string, string> } = $props();

  let search = $state('');
  let status = $state<StatusFilter>('all');
  let months = $state(2);

  const chips: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'unpaid', label: 'Unpaid' },
    { value: 'partial', label: 'Partial' },
    { value: 'paid', label: 'Paid' },
    { value: 'voided', label: 'Voided' },
  ];

  const statusOf = (o: Order) => orderState(view.balances.get(o.clientId), o).status;
  const nameOf = (o: Order) => view.clientsById.get(o.clientId)?.name ?? o.clientName;

  const filtered = $derived(filterOrders(app.orders, { query: search, status, statusOf, nameOf }));
  const page = $derived(newestMonths(filtered, months));
  const days = $derived(groupByDay(page.shown, localDate()));
</script>

<Header title="Orders" />
<TabSwitch side="orders" />
<div class="page">
  <SearchField bind:value={search} label="Search orders" placeholder="Search client, product, note" />
  <Chips options={chips} bind:value={status} label="Filter by status" />

  {#if app.orders.length === 0}
    <EmptyState title="No orders yet">
      <p>Tap “New order” to record your first sale.</p>
    </EmptyState>
  {:else if days.length === 0}
    <p class="hint">No orders match.</p>
  {/if}

  {#each days as day (day.date)}
    <section class="day">
      <div class="day-head">
        <h2>{day.label}</h2>
        <span>{formatMoney(day.sum)}</span>
      </div>
      <div class="card list rows">
        {#each day.orders as o (o.id)}
          <a class="list-row" href="#/orders/{o.id}">
            <span class="grow">
              <span class="title">{nameOf(o)}</span>
              <span class="muted ellipsis">{lineSummary(o.lines)}</span>
            </span>
            <span class="right">
              <span class="amount">{formatMoney(o.total)}</span>
              <StatusTag status={statusOf(o)} />
            </span>
          </a>
        {/each}
      </div>
    </section>
  {/each}

  {#if page.more}
    <button type="button" class="btn btn-block" onclick={() => months++}>Show older</button>
  {/if}
</div>

<style>
  .day {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 6px;
  }
  .day-head {
    display: flex;
    justify-content: space-between;
    padding: 0 4px;
    font-size: var(--fs-small);
    color: var(--muted);
  }
  .day-head h2 {
    margin: 0;
    font-size: var(--fs-small);
    font-weight: 600;
    color: var(--muted);
  }
  .rows {
    padding: 0 14px;
  }
  .rows .list-row {
    padding: 12px 0;
  }
  .right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
  }
</style>
