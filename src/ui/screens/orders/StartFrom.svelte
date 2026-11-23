<script lang="ts">
  import Icon from '../../components/Icon.svelte';
  import { formatMoney } from '../../../core/money.ts';
  import { lineSummary } from '../../../core/orders.ts';
  import type { Id, Order } from '../../../core/types.ts';
  import { localDate } from '../../data.svelte.ts';
  import Balance from './Balance.svelte';
  import { shortDay } from './logic.ts';

  // "Start from" quick picks (§8.4): up to 3 distinct past orders, or a custom order.
  let { clientId, picks, onuse, oncustom }: { clientId: Id; picks: Order[]; onuse: (o: Order) => void; oncustom: () => void } = $props();
  const today = localDate();
</script>

<section class="start">
  <div class="section-head">
    <h2>Start from</h2>
    <Balance {clientId} />
  </div>
  {#each picks as p (p.id)}
    <button type="button" class="card pick" onclick={() => onuse(p)}>
      <span class="grow">
        <span class="muted">{shortDay(p.date, today)}</span>
        <span class="title">{lineSummary(p.lines)}</span>
      </span>
      <span class="right">
        <span class="amount">{formatMoney(p.total)}</span>
        <span class="use">Use ›</span>
      </span>
    </button>
  {/each}
  <button type="button" class="custom" onclick={oncustom}><Icon name="plus" size={20} /> Custom order</button>
  <p class="hint">A picked order is copied into a new order with today's date. Change anything before saving.</p>
</section>

<style>
  .start {
    display: grid;
    gap: 10px;
  }
  .section-head {
    margin: 0 4px;
  }
  .section-head h2 {
    margin: 0;
  }
  .pick {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    text-align: left;
    color: var(--ink);
    cursor: pointer;
  }
  .pick .title {
    line-height: 1.35;
  }
  .right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
  }
  .use {
    font-size: var(--fs-small);
    font-weight: 600;
    color: var(--accent);
  }
  .custom {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 54px;
    border-radius: var(--radius-card);
    border: 1.5px dashed var(--accent);
    background: var(--surface);
    color: var(--accent);
    font-size: 16px;
    font-weight: 600;
  }
</style>
