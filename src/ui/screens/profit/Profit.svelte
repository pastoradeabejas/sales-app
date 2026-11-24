<script lang="ts">
  import { change, expensesByItem, inventoryValue, kpis, monthlyTrend, previousPeriod, profitByClient, profitByProduct } from '../../../core/finance.ts';
  import type { PeriodKind } from '../../../core/finance.ts';
  import { formatMoney } from '../../../core/money.ts';
  import { collected, owedSummary, profitSummary } from '../../../core/stats.ts';
  import StackedBars from '../../charts/StackedBars.svelte';
  import EmptyState from '../../components/EmptyState.svelte';
  import Header from '../../components/Header.svelte';
  import Segmented from '../../components/Segmented.svelte';
  import { app, localDate, view } from '../../data.svelte.ts';
  import { changeText, changeTone, marginText, pointsChange, monthLabel, profitRange, shareText, topRows, trendPoints } from './logic.ts';

  let {}: { params?: Record<string, string>; query?: Record<string, string> } = $props();

  const today = $derived(localDate());
  let kind = $state<PeriodKind>('month');
  let customFrom = $state('');
  let customTo = $state('');
  const range = $derived(profitRange(kind, today, { from: customFrom, to: customTo }));
  const prevRange = $derived(previousPeriod(kind, range));

  const sum = $derived(profitSummary(app.orders, app.purchases, app.stock, view.classesById, range));
  const prevSum = $derived(profitSummary(app.orders, app.purchases, app.stock, view.classesById, prevRange));
  const k = $derived(kpis(sum, app.orders, range));
  const prevK = $derived(kpis(prevSum, app.orders, prevRange));

  // Change of a value that can be null (no data): no change shown when either side is unknown.
  const delta = (cur: number | null, prev: number | null) => (cur === null || prev === null ? null : change(cur, prev));

  type Tile = { label: string; value: string; pct: number | null; hint: string; pts?: { text: string; tone: 'up' | 'down' | 'flat' } };
  const tiles: Tile[] = $derived([
    { label: 'Sales', value: formatMoney(sum.sales), pct: change(sum.sales, prevSum.sales), hint: '' },
    { label: 'Net profit', value: formatMoney(sum.net), pct: change(sum.net, prevSum.net), hint: '' },
    { label: 'Gross margin', value: marginText(k.grossMargin), pct: null, pts: pointsChange(k.grossMargin, prevK.grossMargin), hint: '' },
    { label: 'Net margin', value: marginText(k.netMargin), pct: null, pts: pointsChange(k.netMargin, prevK.netMargin), hint: '' },
    { label: 'Orders', value: String(k.orders), pct: change(k.orders, prevK.orders), hint: '' },
    { label: 'Average order', value: k.avgOrder === null ? '—' : formatMoney(Math.round(k.avgOrder)), pct: delta(k.avgOrder, prevK.avgOrder), hint: '' },
    { label: 'Break-even sales', value: k.breakEven === null ? '—' : formatMoney(k.breakEven), pct: delta(k.breakEven, prevK.breakEven), hint: 'sales needed to cover expenses at this margin' },
  ]);

  const byItem = $derived(expensesByItem(app.purchases, view.classesById, range));
  const byProduct = $derived(profitByProduct(app.orders, range));
  const byClient = $derived(profitByClient(app.orders, range));
  const inventory = $derived(inventoryValue(app.products, view.snapshot));
  const trend = $derived(monthlyTrend(app.orders, app.purchases, app.stock, view.classesById, today));
  const points = $derived(trendPoints(trend));
  const paidIn = $derived(collected(app.payments, range));
  const owed = $derived(owedSummary(view.balances, app.orders, today));

  const empty = $derived(app.orders.length === 0 && app.purchases.length === 0);
  let showProducts = $state(false);
  let showClients = $state(false);
  let showClasses = $state(false);
  let picked = $state<number | null>(null);
</script>

<Header title="Profit" />

<div class="page">
  {#if empty}
    <EmptyState title="No orders or purchases yet" />
  {:else}
    <section class="card stack">
      <Segmented
        label="Period"
        bind:value={kind}
        options={[{ value: 'month', label: 'Month' }, { value: 'quarter', label: 'Quarter' }, { value: 'year', label: 'Year' }, { value: 'custom', label: 'Custom' }]}
      />
      {#if kind === 'custom'}
        <div class="dates">
          <div class="field"><label for="pf-from">From</label><input id="pf-from" class="input" type="date" bind:value={customFrom} /></div>
          <div class="field"><label for="pf-to">To</label><input id="pf-to" class="input" type="date" bind:value={customTo} /></div>
        </div>
      {/if}
      <p class="muted">{range.from} to {range.to}, compared with {prevRange.from} to {prevRange.to}</p>
    </section>

    <section class="tiles">
      {#each tiles as t (t.label)}
        {@const c = t.pts ?? { text: changeText(t.pct), tone: changeTone(t.pct) }}
        <div class="card tile">
          <span class="muted">{t.label}</span>
          <span class="big">{t.value}</span>
          <span class="change {c.tone}">{c.text}</span>
          {#if t.hint}<span class="muted hint">{t.hint}</span>{/if}
        </div>
      {/each}
    </section>

    <section class="card">
      <h2>Income statement</h2>
      <table class="booktabs">
        <tbody>
          <tr><td>Sales</td><td class="num">{formatMoney(sum.sales)}</td></tr>
          <tr><td>− Cost of goods (materials + labour)</td><td class="num">{formatMoney(sum.cogs)}</td></tr>
          <tr class="total"><td>= Gross profit ({marginText(k.grossMargin)})</td><td class="num">{formatMoney(sum.gross)}</td></tr>
          {#each byItem as e (e.classId)}
            <tr><td>− {e.name}</td><td class="num">{formatMoney(e.amount)}</td></tr>
          {:else}
            <tr><td class="muted">− No expenses</td><td class="num">{formatMoney(0)}</td></tr>
          {/each}
          <tr class="total"><td>= Net profit ({marginText(k.netMargin)})</td><td class="num">{formatMoney(sum.net)}</td></tr>
        </tbody>
      </table>
      {#if sum.labour > 0}
        <p class="muted">Labour in production {formatMoney(sum.labour)} (already in cost of goods)</p>
      {/if}
      {#if sum.coveredShare < 1}
        <p class="muted">Based on {Math.round(sum.coveredShare * 100)} % of sales with a known cost</p>
      {/if}
    </section>

    <section class="card stack">
      <h2>Monthly trend</h2>
      <StackedBars {points} label="Sales by month" format={formatMoney} selected={picked} onselect={(i) => (picked = picked === i ? null : i)} paidLabel="Net profit" unpaidLabel="Costs" />
      <table class="booktabs">
        <thead><tr><th>Month</th><th>Sales</th><th>Net</th></tr></thead>
        <tbody>
          {#each trend as t (t.month)}
            <tr><td>{monthLabel(t.month)} {t.month.slice(0, 4)}</td><td class="num">{formatMoney(t.sales)}</td><td class="num">{formatMoney(t.net)}</td></tr>
          {/each}
        </tbody>
      </table>
    </section>

    <section class="card">
      <h2>Cash</h2>
      <div class="list">
        <div class="list-row"><span class="grow">Collected</span><span class="amount">{formatMoney(paidIn)}</span></div>
        <div class="list-row"><span class="grow">Spent</span><span class="amount">{formatMoney(sum.spent)}</span></div>
        <div class="list-row bold"><span class="grow">Net cash</span><span class="amount">{formatMoney(paidIn - sum.spent)}</span></div>
        <div class="list-row"><span class="grow">Owed to you</span><span class="amount">{formatMoney(owed.totalOwed)}</span></div>
        <div class="list-row"><span class="grow">Credit held</span><span class="amount">{formatMoney(owed.creditHeld)}</span></div>
      </div>
    </section>

    <section class="card">
      <h2>Inventory value</h2>
      <p class="big">{formatMoney(inventory.total)}</p>
      <table class="booktabs">
        <tbody>
          {#each topRows(inventory.rows, showClasses) as r (r.classId)}
            <tr><td>{r.name}</td><td class="num">{formatMoney(r.value)}</td></tr>
          {/each}
        </tbody>
      </table>
      {#if inventory.rows.length > 10 && !showClasses}
        <button type="button" class="btn btn-ghost" onclick={() => (showClasses = true)}>Show all ({inventory.rows.length})</button>
      {/if}
      {#if inventory.unknown > 0}
        <p class="muted">{inventory.unknown} {inventory.unknown === 1 ? 'item' : 'items'} without a known cost</p>
      {/if}
    </section>

    <section class="card">
      <h2>Profit by product</h2>
      {#if byProduct.length === 0}
        <p class="muted">No sales in this period.</p>
      {:else}
        <table class="booktabs grid">
          <thead><tr><th>Product</th><th>Sales</th><th>Profit</th><th>Margin</th></tr></thead>
          <tbody>
            {#each topRows(byProduct, showProducts) as r (r.classId)}
              <tr><td>{view.classesById.get(r.classId)?.name ?? r.className}</td><td class="num">{formatMoney(r.sales)}</td><td class="num">{formatMoney(r.profit)}</td><td class="num">{marginText(r.margin)}</td></tr>
            {/each}
          </tbody>
        </table>
        {#if byProduct.length > 10 && !showProducts}
          <button type="button" class="btn btn-ghost" onclick={() => (showProducts = true)}>Show all ({byProduct.length})</button>
        {/if}
      {/if}
    </section>

    <section class="card">
      <h2>Profit by client</h2>
      {#if byClient.length === 0}
        <p class="muted">No sales in this period.</p>
      {:else}
        <table class="booktabs grid">
          <thead><tr><th>Client</th><th>Sales</th><th>Profit</th><th>Margin</th></tr></thead>
          <tbody>
            {#each topRows(byClient, showClients) as r (r.clientId)}
              <tr><td>{view.clientsById.get(r.clientId)?.name ?? r.clientName}</td><td class="num">{formatMoney(r.sales)}</td><td class="num">{formatMoney(r.profit)}</td><td class="num">{marginText(r.margin)}</td></tr>
            {/each}
          </tbody>
        </table>
        {#if byClient.length > 10 && !showClients}
          <button type="button" class="btn btn-ghost" onclick={() => (showClients = true)}>Show all ({byClient.length})</button>
        {/if}
      {/if}
    </section>

    <section class="card">
      <h2>Expenses by item</h2>
      {#each byItem as e (e.classId)}
        <div class="exp">
          <span class="ellipsis">{e.name}</span>
          <span class="num">{formatMoney(e.amount)}</span>
          <span class="num muted">{shareText(e.share)}</span>
          <span class="bar"><i style:width="{Math.round(e.share * 100)}%"></i></span>
        </div>
      {:else}
        <p class="muted">No expenses in this period.</p>
      {/each}
    </section>
  {/if}
</div>

<style>
  .page {
    padding-bottom: calc(var(--nav-h) + 24px);
  }
  h2 {
    margin: 0 0 8px;
  }
  .stack {
    display: grid;
    gap: 12px;
  }
  .stack h2,
  .stack p {
    margin: 0;
  }
  .dates,
  .tiles {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  .tile {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    padding: 14px;
  }
  .big {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
    white-space: nowrap;
  }
  .change {
    font-size: var(--fs-small);
    white-space: nowrap;
  }
  .change.up {
    color: var(--accent-strong);
  }
  .change.down {
    color: var(--owed);
  }
  .change.flat {
    color: var(--muted);
  }
  .hint {
    font-size: 12px;
  }
  .bold .grow,
  .bold .amount {
    font-weight: 700;
  }
  p.muted {
    margin: 6px 0 0;
  }
  button.btn {
    margin-top: 8px;
  }
  /* LaTeX booktabs look, as on the Products table (D-017). */
  .booktabs {
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
    font-family: 'Latin Modern Roman', 'CMU Serif', Georgia, 'Times New Roman', serif;
    font-size: var(--fs-small);
    color: var(--ink);
    border-top: 2px solid var(--ink);
    border-bottom: 2px solid var(--ink);
  }
  .booktabs th {
    padding: 8px 4px 6px;
    text-align: right;
    font-weight: 700;
    border-bottom: 1px solid var(--ink);
  }
  .booktabs th:first-child {
    text-align: left;
  }
  .booktabs td {
    padding: 5px 4px;
    vertical-align: baseline;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .booktabs td:first-child {
    white-space: nowrap;
  }
  .num {
    text-align: right;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  /* Two-column tables: the amount column sizes to its content. */
  .booktabs:not(.grid) td.num {
    width: 7.5em;
  }
  .grid td:first-child,
  .grid th:first-child {
    width: 30%;
  }
  .total td {
    font-weight: 700;
    border-top: 1px solid var(--ink);
  }
  .exp {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto 3.5em;
    gap: 2px 10px;
    padding: 6px 0;
    border-top: 1px solid var(--divider);
  }
  .exp:first-of-type {
    border-top: 0;
  }
  .bar {
    grid-column: 1 / -1;
    height: 4px;
    border-radius: 2px;
    background: var(--chip);
  }
  .bar i {
    display: block;
    height: 100%;
    border-radius: 2px;
    background: var(--accent);
  }
</style>
