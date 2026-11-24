<script lang="ts">
  import { profitBarGeometry, VIEW } from './geometry.ts';
  import { tickMoney, type TrendPoint } from '../screens/profit/logic.ts';

  // One bar per month in hand-built SVG: sales, with net profit over it (the grey rest is costs); a loss goes below zero. Tapping a month selects it.
  let {
    points,
    format,
    selected = null,
    onselect,
  }: { points: TrendPoint[]; format: (v: number) => string; selected?: number | null; onselect?: (i: number) => void } = $props();

  const g = $derived(profitBarGeometry(points));
  const picked = $derived(selected === null ? null : (points[selected] ?? null));
  const summary = $derived(`Sales and net profit by month, last ${points.length} months`);
</script>

<div class="chart">
  <div class="plot">
    <svg viewBox="0 0 {VIEW.w} {VIEW.h}" role="img" aria-label={summary}>
      {#each g.ticks as t (t.value)}
        <line x1={VIEW.left} x2={VIEW.w - VIEW.right} y1={t.y} y2={t.y} class="grid" class:zero={t.value === 0} />
        <text x={VIEW.left - 4} y={t.y + 4} text-anchor="end" class="tick">{tickMoney(t.value)}</text>
      {/each}
      {#each g.bars as b, i (points[i].key)}
        <rect x={b.salesX} y={b.salesY} width={b.w} height={b.salesH} class="sales" class:dim={selected !== null && selected !== i} />
        <rect x={b.netX} y={b.netY} width={b.w} height={b.netH} class="net" class:loss={b.loss} class:dim={selected !== null && selected !== i} />
      {/each}
      {#each g.labelIdx as i (i)}
        <text x={g.bars[i].cx} y={VIEW.h - 6} text-anchor="middle" class="tick">{points[i].label}</text>
      {/each}
    </svg>
    <div class="hits" style:left="{(VIEW.left / VIEW.w) * 100}%" style:right="{(VIEW.right / VIEW.w) * 100}%">
      {#each points as p, i (p.key)}
        <button type="button" aria-label="{p.label}: sales {format(p.sales)}, net {format(p.net)}" aria-pressed={selected === i} onclick={() => onselect?.(i)}></button>
      {/each}
    </div>
  </div>
  <div class="legend">
    <span><i class="sales"></i>Sales</span>
    <span><i class="net"></i>Net profit</span>
    <span><i class="net loss"></i>Loss</span>
  </div>
  <p class="tip" aria-live="polite">
    {#if picked}
      <b>{picked.label}</b> · sales {format(picked.sales)} · costs {format(picked.costs)} · net {format(picked.net)}
    {:else}
      Tap a month for details.
    {/if}
  </p>
</div>

<style>
  .chart {
    display: grid;
    gap: 8px;
  }
  .plot {
    position: relative;
  }
  svg {
    display: block;
    width: 100%;
    height: auto;
  }
  .grid {
    stroke: var(--divider);
    stroke-width: 1;
  }
  .grid.zero {
    stroke: var(--muted);
  }
  .tick {
    fill: var(--muted);
    font-size: 9px;
  }
  .sales {
    fill: var(--hero-muted);
    background: var(--hero-muted);
  }
  .net {
    fill: var(--accent);
    background: var(--accent);
  }
  .loss {
    fill: var(--danger);
    background: var(--danger);
  }
  .dim {
    opacity: 0.4;
  }
  .hits {
    position: absolute;
    top: 0;
    bottom: 0;
    display: flex;
  }
  .hits button {
    flex: 1;
    min-width: 0;
    padding: 0;
    border: 0;
    background: none;
    cursor: pointer;
  }
  .hits button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  .legend {
    display: flex;
    gap: 14px;
    font-size: 12px;
    color: var(--muted);
  }
  .legend span {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .legend i {
    width: 10px;
    height: 10px;
    border-radius: 3px;
  }
  .tip {
    margin: 0;
    min-height: 1.4em;
    font-size: var(--fs-small);
    color: var(--muted);
  }
  .tip b {
    color: var(--ink);
  }
</style>
