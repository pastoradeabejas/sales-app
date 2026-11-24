<script lang="ts">
  import { formatMoney } from '../../../core/money.ts';
  import { profitSummary } from '../../../core/stats.ts';
  import type { Range } from '../../../core/stats.ts';
  import { app, view } from '../../data.svelte.ts';
  import { liveName } from '../stock/grouping.ts';
  import { profitByClass } from './profitLogic.ts';

  let { range }: { range: Range } = $props();

  const total = $derived(profitSummary(app.orders, app.purchases, app.stock, view.classesById, range));
  const share = $derived(Math.round(total.coveredShare * 100));
  const rows = $derived(profitByClass(app.orders, range).filter((r) => r.coveredShare > 0));
</script>

<section class="card">
  <h2>Profit</h2>
  {#if total.sales === 0 && total.spent === 0}
    <p class="muted">No sales or purchases in this period.</p>
  {:else}
    <div class="list">
      <div class="list-row"><span class="grow">Sales</span><span class="amount">{formatMoney(total.sales)}</span></div>
      <div class="list-row"><span class="grow">Cost of goods</span><span class="amount">{formatMoney(total.cogs)}</span></div>
      <div class="list-row bold"><span class="grow">Gross profit</span><span class="amount">{formatMoney(total.gross)}</span></div>
      <div class="list-row"><span class="grow">Expenses</span><span class="amount">{formatMoney(total.expenses)}</span></div>
      <div class="list-row bold"><span class="grow">Net profit</span><span class="amount">{formatMoney(total.net)}</span></div>
    </div>
    {#if total.labour > 0}
      <p class="muted">Labour in production {formatMoney(total.labour)} (already in product costs)</p>
    {/if}
    {#if total.coveredShare === 0 && total.sales > 0}
      <p class="muted">Add costs to variants or stock to see profit.</p>
    {:else if total.coveredShare > 0 && total.coveredShare < 1}
      <p class="muted">Based on {share}% of sales with known cost.</p>
    {/if}
    <div class="list">
      {#each rows as r (r.classId)}
        <div class="list-row">
          <span class="grow title">{liveName(view.classesById, r.classId, r.className)}</span>
          <span class="amount">{formatMoney(r.profit)}</span>
        </div>
      {/each}
    </div>
  {/if}
</section>

<style>
  h2 {
    margin: 0 0 8px;
  }
  .bold .grow,
  .bold .amount {
    font-weight: 700;
  }
</style>
