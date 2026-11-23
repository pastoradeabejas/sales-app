<script lang="ts">
  import EmptyState from '../../components/EmptyState.svelte';
  import Header from '../../components/Header.svelte';
  import Icon from '../../components/Icon.svelte';
  import Tag from '../../components/Tag.svelte';
  import { formatAmount } from '../../../core/quantity.ts';
  import { isLowStock, sellRate } from '../../../core/stock.ts';
  import { app, localDate, view } from '../../data.svelte.ts';
  import { daysLeftText, lastMovementText, recentMovements, transformSummary } from './logic.ts';

  const today = localDate();
  const classes = $derived(app.products.filter((c) => c.trackStock && !c.archived).sort((a, b) => a.name.localeCompare(b.name)));
  const items = $derived(
    classes.map((c) => {
      const s = view.snapshot.get(c.id);
      const stock = s?.stock ?? 0;
      return {
        cls: c,
        stock,
        low: isLowStock(c, stock),
        last: lastMovementText(s?.last ?? null, c, today),
        left: daysLeftText(c, stock, sellRate(c.id, app.orders, today)),
      };
    }),
  );
  const recent = $derived(recentMovements(app.orders, app.stock, app.recipes, view.classesById, today));
  const recipes = $derived(app.recipes.filter((r) => !r.archived).sort((a, b) => a.name.localeCompare(b.name)));
  const icons = { add: 'plus', remove: 'minus', transform: 'transform', sale: 'orders' } as const;
</script>

<Header title="Stock" />

<div class="page">
  <section class="big-actions">
    <a class="big add" href="#/stock/add"><Icon name="plus" size={24} />Add</a>
    <a class="big tr" href="#/stock/transform"><Icon name="transform" size={24} />Transform</a>
    <a class="big remove" href="#/stock/remove"><Icon name="minus" size={24} />Remove</a>
  </section>

  {#if !classes.length}
    <EmptyState title="No stock to show yet">
      <p>Turn on "Track stock" for a product to follow its stock here.</p>
      <a class="btn" href="#/products">Products</a>
    </EmptyState>
  {:else}
    <section class="current">
      <h2>Current stock</h2>
      {#each items as s (s.cls.id)}
        <a class="card stock-card" href="#/stock/{s.cls.id}">
          <div class="row-between">
            <span class="name">
              <span class="title">{s.cls.name}</span>
              {#if !s.cls.sellable}<Tag>raw material</Tag>{/if}
              {#if s.low}<Tag tone="low">Low</Tag>{/if}
            </span>
            <span class="qty" class:owed-text={s.stock < 0}>{formatAmount(s.stock, s.cls.unit.decimals, s.cls.unit.name)}</span>
          </div>
          <div class="row-between muted">
            <span>{s.last}</span>
            {#if s.stock < 0}<Tag tone="negative">sold without stock</Tag>{:else}<span>{s.left}</span>{/if}
          </div>
        </a>
      {/each}
    </section>

    <section class="card">
      <h2>Recent movements</h2>
      <div class="list">
        {#each recent as m (m.key)}
          <a class="list-row" href={m.href}>
            <span class="badge {m.kind}" aria-hidden="true"><Icon name={icons[m.kind]} size={18} /></span>
            <span class="grow">
              <span class="title ellipsis">{m.title}</span>
              <span class="muted ellipsis">{m.sub}</span>
            </span>
            <span class="deltas">{#each m.deltas as d (d)}<span>{d}</span>{/each}</span>
          </a>
        {:else}
          <p class="muted">No movements yet.</p>
        {/each}
      </div>
    </section>
  {/if}

  <section class="card">
    <div class="section-head">
      <h2>Recipes</h2>
      <a class="btn-ghost new" href="#/stock/transform">+ New</a>
    </div>
    <div class="list">
      {#each recipes as r (r.id)}
        <div class="list-row">
          <span class="grow">
            <span class="title">{r.name}</span>
            <span class="muted">{transformSummary(r.inputs, r.outputs, view.classesById)}</span>
          </span>
          <a class="use" href="#/stock/transform?recipe={r.id}" aria-label="Use {r.name}">Use</a>
        </div>
      {:else}
        <p class="muted">No recipes yet. Tick "Save as recipe" on a transform to keep one.</p>
      {/each}
    </div>
  </section>
</div>

<style>
  h2,
  p {
    margin: 0;
  }
  .big-actions {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }
  .big {
    height: 84px;
    border-radius: var(--radius-card);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    text-decoration: none;
    font-weight: 600;
    border: 1px solid transparent;
  }
  .add {
    background: var(--accent);
    color: var(--on-accent);
  }
  .tr {
    background: var(--ink);
    color: var(--bg);
  }
  .remove {
    background: var(--surface);
    border-color: var(--border);
    color: var(--owed);
  }
  .current {
    display: grid;
    gap: 8px;
  }
  .current h2 {
    margin: 0 4px;
  }
  .stock-card {
    display: grid;
    gap: 6px;
    padding: 14px 16px;
    color: var(--ink);
    text-decoration: none;
  }
  .stock-card .row-between {
    align-items: center;
  }
  .name {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .qty {
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.02em;
    white-space: nowrap;
  }
  .card > h2 {
    margin-bottom: 6px;
  }
  .badge {
    flex: none;
    width: 34px;
    height: 34px;
    border-radius: 10px;
    display: grid;
    place-items: center;
    background: var(--chip);
    color: var(--ink);
  }
  .badge.add {
    background: var(--accent-soft);
    color: var(--accent-strong);
  }
  .badge.transform {
    background: var(--ink);
    color: var(--bg);
  }
  .badge.remove {
    background: var(--owed-tag);
    color: var(--owed-on-bg);
  }
  .deltas {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    font-size: 14px;
    font-weight: 700;
    text-align: right;
  }
  .new {
    min-height: var(--tap);
    display: inline-flex;
    align-items: center;
    font-weight: 600;
    text-decoration: none;
  }
  .use {
    min-height: var(--tap);
    padding: 0 14px;
    border-radius: 10px;
    background: var(--accent-soft);
    color: var(--accent-strong);
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    text-decoration: none;
  }
</style>
