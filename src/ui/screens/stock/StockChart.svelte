<script lang="ts">
  import { fullName } from '../../../core/groups.ts';
  import { formatAmount } from '../../../core/quantity.ts';
  import type { Movement } from '../../../core/stock.ts';
  import type { ProductClass } from '../../../core/types.ts';
  import { chartModel, dayLabel } from './logic.ts';

  // Stock level over time (§8.12): hand-built SVG step line with add and transform markers.
  let { cls, timeline, today }: { cls: ProductClass; timeline: Movement[]; today: string } = $props();

  // Drawn at the real pixel width so markers keep their size on any screen.
  let W = $state(340);
  const H = 140;
  const m = $derived(chartModel(timeline, today, W || 340, H));
  const fmt = (v: number) => formatAmount(v, cls.unit.decimals, cls.unit.name);
  const label = $derived(
    m
      ? `${fullName(cls)} stock from ${dayLabel(m.first, today)} to ${dayLabel(m.last, today)}: highest ${fmt(m.max)}, now ${fmt(m.days[m.days.length - 1].balance)}.`
      : '',
  );
</script>

{#if m}
  <figure bind:clientWidth={W}>
    <svg viewBox="0 0 {W || 340} {H}" width="100%" role="img" aria-label={label}>
      <line class="base" x1="0" x2={W} y1={m.y(0)} y2={m.y(0)} />
      <line class="grid" x1="0" x2={W} y1={m.y(m.max)} y2={m.y(m.max)} />
      <polyline class="line" points={m.points.map((p) => p.join(',')).join(' ')} />
      {#each m.markers as k, i (i)}
        {#if k.kind === 'add'}
          <circle class="add" cx={k.x} cy={k.y} r="4" />
        {:else}
          <rect class="tr" x={k.x - 4} y={k.y - 4} width="8" height="8" transform="rotate(45 {k.x} {k.y})" />
        {/if}
      {/each}
    </svg>
    <div class="axis muted" aria-hidden="true">
      <span>{fmt(m.max)} max</span>
    </div>
    <div class="axis muted" aria-hidden="true">
      <span>{dayLabel(m.first, today)}</span><span>{m.last === today ? 'Today' : dayLabel(m.last, today)}</span>
    </div>
    <div class="legend muted" aria-hidden="true">
      <span><i class="dot"></i>Add</span>
      <span><i class="diamond"></i>Transform</span>
    </div>
    <div class="visually-hidden">
      <table>
      <caption>{fullName(cls)} stock at the end of each day with movements</caption>
      <thead><tr><th scope="col">Date</th><th scope="col">Stock</th></tr></thead>
      <tbody>
        {#each m.days as d (d.date)}<tr><td>{d.date}</td><td>{fmt(d.balance)}</td></tr>{/each}
      </tbody>
    </table>
    </div>
  </figure>
{/if}

<style>
  figure {
    margin: 0;
    display: grid;
    gap: 6px;
  }
  svg {
    height: auto;
    display: block;
    overflow: visible;
  }
  .base {
    stroke: var(--border);
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }
  .grid {
    stroke: var(--divider);
    stroke-dasharray: 3 4;
    vector-effect: non-scaling-stroke;
  }
  .line {
    fill: none;
    stroke: var(--accent);
    stroke-width: 2;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }
  .add {
    fill: var(--accent);
    stroke: var(--surface);
    stroke-width: 2;
    vector-effect: non-scaling-stroke;
  }
  .tr {
    fill: var(--ink);
    stroke: var(--surface);
    stroke-width: 2;
    vector-effect: non-scaling-stroke;
  }
  .axis {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
  }
  .legend {
    display: flex;
    gap: 14px;
    font-size: 12px;
  }
  .legend span {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .dot,
  .diamond {
    width: 8px;
    height: 8px;
    background: var(--accent);
    border-radius: 999px;
  }
  .diamond {
    background: var(--ink);
    border-radius: 0;
    transform: rotate(45deg);
  }
</style>
