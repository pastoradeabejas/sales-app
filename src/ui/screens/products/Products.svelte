<script lang="ts">
  import Header from '../../components/Header.svelte';
  import Tag from '../../components/Tag.svelte';
  import EmptyState from '../../components/EmptyState.svelte';
  import { app, view, localDate } from '../../data.svelte.ts';
  import { formatUnitCost } from '../../../core/money.ts';
  import { formatAmount } from '../../../core/quantity.ts';
  import { isLowStock } from '../../../core/stock.ts';
  import { rangeFor, unitsSold, type ClassSold } from '../../../core/stats.ts';
  import { priceLabel, sortClasses, sortedVariants } from './logic.ts';

  let showArchived = $state(false);

  const sold = $derived(
    new Map<string, ClassSold>(unitsSold(app.orders, view.balances, rangeFor('month', localDate())).map((c) => [c.classId, c])),
  );
  const classes = $derived(sortClasses(app.products));
  const shown = $derived(classes.filter((c) => showArchived || !c.archived));
  const archivedCount = $derived(classes.filter((c) => c.archived).length);
</script>

<Header title="Products">
  {#snippet actions()}
    <a class="btn btn-primary" href="#/products/new">+ New class</a>
  {/snippet}
</Header>

<div class="page">
  {#if app.products.length === 0}
    <EmptyState title="Start by adding your first product">
      <a class="btn btn-primary" href="#/products/new">+ New class</a>
    </EmptyState>
  {/if}

  {#each shown as c (c.id)}
    {@const snap = view.snapshot.get(c.id)}
    {@const s = sold.get(c.id)}
    <section class="card" class:archived={c.archived}>
      <a class="head" href="#/products/{c.id}" aria-label="Edit {c.name}">
        <span class="row-between">
          <h2>{c.name}</h2>
          <span class="muted">
            {c.unit.name}{#if c.trackStock && snap} · {formatAmount(snap.stock, c.unit.decimals, c.unit.name)} in stock{/if}
          </span>
        </span>
        <span class="tags">
          {#if c.archived}<Tag>Archived</Tag>{/if}
          {#if !c.sellable}<Tag>Raw material</Tag>{/if}
          {#if c.trackStock && snap && isLowStock(c, snap.stock)}<Tag tone="low">Low</Tag>{/if}
          <span class="muted">Sold this month: {formatAmount(s?.amount ?? 0, c.unit.decimals, c.unit.name)}</span>
        </span>
      </a>

      {#if c.variants.length}
        <div class="table" role="table" aria-label="Variants of {c.name}">
          <div class="tr th" role="row">
            <span role="columnheader">Variant</span><span role="columnheader">Price</span>
            <span role="columnheader">Cost</span><span role="columnheader">Sold</span>
          </div>
          {#each sortedVariants(c.variants) as v (v.id)}
            {@const vs = s?.variants.find((x) => x.variantId === v.id)}
            <div class="tr" class:greyed={v.archived} role="row">
              <span role="cell" class="lbl">{v.label}{v.archived ? ' · archived' : ''}</span>
              <span role="cell">
                {priceLabel(v, c.unit.name)}
                {#if v.price === 0}<Tag>free</Tag>{/if}
              </span>
              <span role="cell">{v.cost === null ? '—' : formatUnitCost(v.cost)}</span>
              <span role="cell" class="amount">
                {v.kind === 'fixed' ? (vs?.quantity ?? 0) : formatAmount(vs?.amount ?? 0, c.unit.decimals, c.unit.name)}
              </span>
            </div>
          {/each}
        </div>
      {:else}
        <p class="muted none">{c.sellable ? 'No variants yet' : 'Not sold · used in transforms'}</p>
      {/if}
    </section>
  {/each}

  {#if archivedCount > 0}
    <button type="button" class="btn btn-ghost" onclick={() => (showArchived = !showArchived)}>
      {showArchived ? 'Hide archived' : `Show archived (${archivedCount})`}
    </button>
  {/if}
</div>

<style>
  .head {
    display: grid;
    gap: 4px;
    color: inherit;
    text-decoration: none;
    min-height: var(--tap);
  }
  h2 {
    margin: 0;
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .table {
    margin-top: 8px;
  }
  .tr {
    display: grid;
    grid-template-columns: minmax(0, 1.6fr) minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 0.8fr);
    gap: 6px;
    align-items: center;
    padding: 10px 0;
    border-top: 1px solid var(--divider);
    font-size: var(--fs-small);
  }
  .tr > span:nth-child(n + 2) {
    text-align: right;
  }
  .th {
    color: var(--muted);
    border-top: 0;
    padding-bottom: 2px;
  }
  .lbl {
    font-weight: 500;
    overflow-wrap: anywhere;
  }
  .greyed {
    color: var(--muted);
  }
  .archived {
    opacity: 0.8;
  }
  .none {
    margin: 8px 0 0;
  }
</style>
