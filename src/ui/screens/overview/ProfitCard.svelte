<script lang="ts">
  import { formatMoney } from '../../../core/money.ts';
  import { profit } from '../../../core/stats.ts';
  import type { Range } from '../../../core/stats.ts';
  import { app } from '../../data.svelte.ts';
  import { profitByClass } from './profitLogic.ts';

  let { range }: { range: Range } = $props();

  const total = $derived(profit(app.orders, range));
  const share = $derived(Math.round(total.coveredShare * 100));
  const rows = $derived(profitByClass(app.orders, range).filter((r) => r.coveredShare > 0));
</script>

<section class="card">
  <h2>Profit</h2>
  {#if total.coveredShare === 0}
    <p class="muted">Add costs to variants or stock to see profit.</p>
  {:else}
    <div class="pair">
      <div><span class="muted">Profit</span><span class="big">{formatMoney(total.profit)}</span></div>
      <div><span class="muted">Cost</span><span class="big">{formatMoney(total.cost)}</span></div>
    </div>
    <p class="muted">Based on {share}% of sales with known cost.</p>
    <div class="list">
      {#each rows as r (r.classId)}
        <div class="list-row">
          <span class="grow title">{r.className}</span>
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
  .pair {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  .pair div {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .big {
    font-size: 22px;
    font-weight: 700;
  }
</style>
