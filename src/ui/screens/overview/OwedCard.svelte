<script lang="ts">
  import { formatMoney } from '../../../core/money.ts';
  import { debtAge } from '../../../core/payments.ts';
  import { owedSummary } from '../../../core/stats.ts';
  import { app, localDate, view } from '../../data.svelte.ts';
  import { debtSegments } from './logic.ts';

  const today = $derived(localDate());
  const sum = $derived(owedSummary(view.balances, app.orders, today));
  const segs = $derived(debtSegments(debtAge(view.balances.values(), app.orders, today)));
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
</script>

<section class="hero">
  <span class="muted">Owed to you</span>
  <span class="total">{formatMoney(sum.totalOwed)}</span>
  <span class="line">{plural(sum.clients, 'client')} · {plural(sum.unpaidOrders, 'unpaid order')} · {sum.over30} over 30 days</span>
  {#if sum.creditHeld > 0}<span class="line">Credit held {formatMoney(sum.creditHeld)}</span>{/if}
  <div class="bar" role="img" aria-label="Debt age: {segs.map((s) => `${s.label} ${formatMoney(s.amount)}`).join(', ')}">
    {#each segs as s, i (s.key)}
      {#if s.pct > 0}<span class="seg s{i}" style:width="{s.pct}%"></span>{/if}
    {/each}
  </div>
  <div class="ages">
    {#each segs as s (s.key)}
      <span>{s.label}<br /><b>{formatMoney(s.amount)}</b></span>
    {/each}
  </div>
</section>

<style>
  .hero {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 20px;
    border-radius: var(--radius-hero);
    background: var(--hero);
    color: var(--hero-ink);
  }
  .muted,
  .line,
  .ages {
    color: var(--hero-muted);
  }
  .total {
    font-size: 40px;
    font-weight: 700;
    letter-spacing: -0.03em;
  }
  .line {
    font-size: 14px;
  }
  .bar {
    display: flex;
    gap: 2px;
    height: 8px;
    margin-top: 10px;
    border-radius: 999px;
    overflow: hidden;
    background: var(--hero-muted);
    background: color-mix(in srgb, var(--hero-muted) 25%, transparent);
  }
  .s0 {
    background: var(--hero-ink);
  }
  .s1 {
    background: var(--owed-bar);
  }
  .s2 {
    background: var(--owed-mid);
  }
  .s3 {
    background: color-mix(in srgb, var(--owed-mid) 55%, black);
  }
  .ages {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    font-size: 12px;
  }
  .ages b {
    color: var(--hero-ink);
  }
</style>
