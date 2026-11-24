<script lang="ts">
  import { unitsSold } from '../../../core/stats.ts';
  import type { ClassSold, Range } from '../../../core/stats.ts';
  import ChartLegend from '../../charts/ChartLegend.svelte';
  import Icon from '../../components/Icon.svelte';
  import { app, view } from '../../data.svelte.ts';
  import { liveName } from '../stock/grouping.ts';
  import SeriesSheet from './SeriesSheet.svelte';
  import { splitText, unitsText, variantText } from './logic.ts';

  let { range }: { range: Range } = $props();

  const nameOf = (c: ClassSold) => liveName(view.classesById, c.classId, c.className);
  const classes = $derived(unitsSold(app.orders, view.balances, range));
  let expanded = $state<Record<string, boolean>>({});
  let sheetOpen = $state(false);
  let sheetClassId = $state<string | null>(null);
  const sheetClass = $derived<ClassSold | null>(classes.find((c) => c.classId === sheetClassId) ?? null);
</script>

<ChartLegend />
{#each classes as c (c.classId)}
  <div class="cls">
    <div class="head">
      <button type="button" class="name" onclick={() => { sheetClassId = c.classId; sheetOpen = true; }} aria-label="{nameOf(c)}, {unitsText(c)}. Show chart">
        <span class="title">{nameOf(c)}</span>
        <span class="amount">{unitsText(c)}</span>
      </button>
      <button type="button" class="toggle" aria-expanded={!!expanded[c.classId]} aria-label="Variants of {nameOf(c)}" onclick={() => (expanded[c.classId] = !expanded[c.classId])}>
        <Icon name={expanded[c.classId] ? 'up' : 'down'} />
      </button>
    </div>
    {#if expanded[c.classId]}
      {#each c.variants as v (v.variantId)}
        {@const s = splitText(v, c)}
        <div class="variant">
          <div class="row-between">
            <span>{v.label}</span>
            <span><b>{variantText(v, c)}</b> <span class="muted">· {s.unpaid}</span></span>
          </div>
          <div class="bar" role="img" aria-label="{v.label}: {s.paidPct}% paid, {s.unpaidPct}% unpaid">
            <span class="paid" style:width="{s.paidPct}%"></span>
            <span class="unpaid" style:width="{s.unpaidPct}%"></span>
          </div>
        </div>
      {/each}
    {/if}
  </div>
{:else}
  <p class="muted">No sales in this range.</p>
{/each}

<SeriesSheet bind:open={sheetOpen} cls={sheetClass} {range} />

<style>
  .cls {
    display: grid;
    gap: 8px;
    border-top: 1px solid var(--divider);
    padding-top: 6px;
  }
  .cls:first-of-type {
    border-top: 0;
  }
  .head {
    display: flex;
    align-items: center;
  }
  .name {
    flex: 1;
    display: flex;
    justify-content: space-between;
    align-items: center;
    min-height: var(--tap);
    padding: 0;
    border: 0;
    background: none;
    color: var(--ink);
    font: inherit;
    text-align: left;
  }
  .toggle {
    width: var(--tap);
    height: var(--tap);
    border: 0;
    background: none;
    color: var(--muted);
  }
  .variant {
    display: grid;
    gap: 6px;
    padding-left: 12px;
    font-size: 14px;
  }
  .bar {
    display: flex;
    height: 10px;
    border-radius: 999px;
    overflow: hidden;
    background: var(--chip);
  }
  .paid {
    background: var(--accent);
  }
  .unpaid {
    background: var(--owed-bar);
  }
</style>
