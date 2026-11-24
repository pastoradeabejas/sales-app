<script lang="ts">
  import { fullName } from '../../../core/groups.ts';
  import { formatMoney } from '../../../core/money.ts';
  import { formatAmount } from '../../../core/quantity.ts';
  import { collected, profitSummary, revenue, topClients, whoOwes } from '../../../core/stats.ts';
  import { daysLeft, isLowStock, sellRate } from '../../../core/stock.ts';
  import Avatar from '../../components/Avatar.svelte';
  import EmptyState from '../../components/EmptyState.svelte';
  import Header from '../../components/Header.svelte';
  import Icon from '../../components/Icon.svelte';
  import Segmented from '../../components/Segmented.svelte';
  import Tag from '../../components/Tag.svelte';
  import { app, localDate, view } from '../../data.svelte.ts';
  import { syncNow } from '../../sync.svelte.ts';
  import { showToast } from '../../toast.svelte.ts';
  import { checkAppUpdate } from '../../update.ts';
  import OwedCard from './OwedCard.svelte';
  import ProfitCard from './ProfitCard.svelte';
  import SyncBadge from './SyncBadge.svelte';
  import UnitsSold from './UnitsSold.svelte';
  import { stockLine } from './stockLine.ts';
  import { owedDetail, viewRange } from './logic.ts';
  import type { RangeKind } from './logic.ts';

  let {}: { params?: Record<string, string>; query?: Record<string, string> } = $props();

  const today = $derived(localDate());

  // Sync button: pulls and pushes data now (not in Demo mode) and checks for a new app version.
  let checking = $state(false);
  async function checkNow() {
    checking = true;
    try {
      const [, found] = await Promise.all([app.settings.demoMode ? undefined : syncNow(), checkAppUpdate()]);
      const appText = found ? 'New app version found, loading…' : 'App is up to date';
      showToast(app.settings.demoMode ? `${appText} (Demo mode: data is not synced)` : `Data synced · ${appText}`);
    } finally {
      checking = false;
    }
  }
  let kind = $state<RangeKind>('month');
  let customFrom = $state('');
  let customTo = $state('');
  const range = $derived(viewRange(kind, today, { from: customFrom, to: customTo }));
  const rangeNoun = $derived(kind === 'custom' ? 'in range' : `this ${kind}`);

  const products = $derived(app.products.filter((p) => !p.archived));
  const debtors = $derived(whoOwes(view.balances, app.orders, today, 5));
  const top = $derived(topClients(app.orders, range, 'revenue', 5));
  const sales = $derived(revenue(app.orders, range));
  const paidIn = $derived(collected(app.payments, range));
  const spent = $derived(profitSummary(app.orders, app.purchases, app.stock, view.classesById, range).spent);
  const stock = $derived(
    products
      .filter((p) => p.trackStock)
      .map((p) => {
        const stockNow = view.snapshot.get(p.id)?.stock ?? 0;
        const rate = sellRate(p.id, app.orders, today);
        const left = rate.enoughData ? daysLeft(stockNow, rate.perDay) : null;
        return { cls: p, stock: stockNow, left, last: view.snapshot.get(p.id)?.last ?? null, low: isLowStock(p, stockNow) };
      }),
  );
</script>

<Header title="Overview">
  {#snippet actions()}
    <SyncBadge />
    <button type="button" class="icon-btn sync-btn" class:spin={checking} disabled={checking} aria-label="Sync and check for updates" onclick={checkNow}>
      <Icon name="refresh" />
    </button>
    <a class="icon-btn" href="#/settings" aria-label="Settings"><Icon name="settings" /></a>
  {/snippet}
</Header>

<div class="page">
  {#if products.length === 0}
    <EmptyState title="Start by adding your first product">
      <a class="btn btn-primary" href="#/products">Add a product</a>
    </EmptyState>
  {/if}

  <OwedCard />

  <section class="card">
    <div class="section-head">
      <h2>Who owes</h2>
      <a href="#/clients?sort=owed">See all</a>
    </div>
    <div class="list">
      {#each debtors as d (d.clientId)}
        <a class="list-row" href="#/clients/{d.clientId}">
          <Avatar name={d.clientName} />
          <span class="grow"><span class="title">{d.clientName}</span><span class="muted">{owedDetail(d.orderCount, d.oldestDays)}</span></span>
          <span class="amount owed-text">{formatMoney(d.owed)}</span>
        </a>
      {:else}
        <p class="muted">Nobody owes you anything.</p>
      {/each}
    </div>
  </section>

  <section class="card units">
    <div class="row-between">
      <h2>Units sold</h2>
    </div>
    <Segmented
      label="Range"
      bind:value={kind}
      options={[{ value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }, { value: 'year', label: 'Year' }, { value: 'custom', label: 'Custom' }]}
    />
    {#if kind === 'custom'}
      <div class="dates">
        <div class="field"><label for="ov-from">From</label><input id="ov-from" class="input" type="date" bind:value={customFrom} /></div>
        <div class="field"><label for="ov-to">To</label><input id="ov-to" class="input" type="date" bind:value={customTo} /></div>
      </div>
    {/if}
    <UnitsSold {range} />
  </section>

  {#if stock.length > 0}
    <section class="card">
      <div class="section-head">
        <h2>Stock</h2>
        <a href="#/stock">Open stock</a>
      </div>
      <div class="list">
        {#each stock as s (s.cls.id)}
          <a class="list-row" href="#/stock">
            <span class="grow">
              <span class="title">{fullName(s.cls)}</span>
              <span class="muted">{stockLine(s.cls, s.left, s.last)}</span>
            </span>
            {#if s.low}<Tag tone="low">Low</Tag>{/if}
            <span class="amount">{formatAmount(s.stock, s.cls.unit.decimals, s.cls.unit.name)}</span>
          </a>
        {/each}
      </div>
    </section>
  {/if}

  <section class="card">
    <h2>Top clients {rangeNoun}</h2>
    <div class="list">
      {#each top as c (c.clientId)}
        <a class="list-row" href="#/clients/{c.clientId}">
          <Avatar name={c.clientName} />
          <span class="grow title">{c.clientName}</span>
          <span class="amount">{formatMoney(c.value)}</span>
        </a>
      {:else}
        <p class="muted">No sales in this range.</p>
      {/each}
    </div>
  </section>

  <section class="pair">
    <div class="card"><span class="muted">Sales {rangeNoun}</span><span class="big">{formatMoney(sales)}</span></div>
    <div class="card"><span class="muted">Collected {rangeNoun}</span><span class="big">{formatMoney(paidIn)}</span></div>
    <div class="card"><span class="muted">Spent {rangeNoun}</span><span class="big">{formatMoney(spent)}</span></div>
  </section>

  <ProfitCard {range} />
</div>

<style>
  .sync-btn {
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }
  .spin :global(svg) {
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .page {
    padding-bottom: calc(var(--nav-h) + 96px);
  }
  .units {
    display: grid;
    gap: 14px;
  }
  h2 {
    margin: 0;
  }
  .dates {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  .pair {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  .pair .card:last-child {
    grid-column: 1 / -1;
  }
  .pair .card {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 14px;
  }
  .big {
    font-size: 22px;
    font-weight: 700;
  }
</style>

