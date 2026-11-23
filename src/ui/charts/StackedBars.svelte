<script lang="ts">
  import { barGeometry, VIEW } from './geometry.ts';
  import type { ChartPoint } from './geometry.ts';
  import ChartLegend from './ChartLegend.svelte';

  // Stacked paid / unpaid bars in hand-built SVG. Tapping a bar selects it (tooltip) and reports its index.
  let {
    points,
    label,
    format,
    selected = null,
    onselect,
  }: { points: ChartPoint[]; label: string; format: (v: number) => string; selected?: number | null; onselect?: (i: number) => void } = $props();

  const g = $derived(barGeometry(points));
  const total = $derived(points.reduce((s, p) => s + p.total, 0));
  const summary = $derived(`${label}: ${format(total)} in total over ${points.length} periods`);
  const picked = $derived(selected === null ? null : (points[selected] ?? null));
</script>

<div class="chart">
  <div class="plot">
    <svg viewBox="0 0 {VIEW.w} {VIEW.h}" role="img" aria-label={summary}>
      {#each g.ticks as t (t.value)}
        <line x1={VIEW.left} x2={VIEW.w - VIEW.right} y1={t.y} y2={t.y} class="grid" />
        <text x={VIEW.left - 4} y={t.y + 4} text-anchor="end" class="tick">{format(t.value)}</text>
      {/each}
      {#each g.bars as b, i (points[i].key)}
        <rect x={b.x} y={b.paidY} width={b.w} height={b.paidH} class="paid" class:dim={selected !== null && selected !== i} />
        <rect x={b.x} y={b.unpaidY} width={b.w} height={b.unpaidH} class="unpaid" class:dim={selected !== null && selected !== i} />
      {/each}
      {#each g.labelIdx as i (i)}
        <text x={g.bars[i].cx} y={VIEW.h - 6} text-anchor="middle" class="tick">{points[i].label}</text>
      {/each}
    </svg>
    <div class="hits" style:left="{(VIEW.left / VIEW.w) * 100}%" style:right="{(VIEW.right / VIEW.w) * 100}%">
      {#each points as p, i (p.key)}
        <button type="button" aria-label="{p.label}: {format(p.total)}" aria-pressed={selected === i} onclick={() => onselect?.(i)}></button>
      {/each}
    </div>
  </div>
  <ChartLegend />
  <p class="tip" aria-live="polite">
    {#if picked}
      <b>{picked.label}</b> · {format(picked.total)} · paid {format(picked.paid)} · unpaid {format(picked.unpaid)}
    {:else}
      Tap a bar for details.
    {/if}
  </p>
  <div class="visually-hidden">
    <table>
    <caption>{label}</caption>
    <thead><tr><th>Period</th><th>Paid</th><th>Unpaid</th><th>Total</th></tr></thead>
    <tbody>
      {#each points as p (p.key)}
        <tr><td>{p.label}</td><td>{format(p.paid)}</td><td>{format(p.unpaid)}</td><td>{format(p.total)}</td></tr>
      {/each}
    </tbody>
  </table>
  </div>
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
  .tick {
    fill: var(--muted);
    font-size: 9px;
  }
  .paid {
    fill: var(--accent);
  }
  .unpaid {
    fill: var(--owed-bar);
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
