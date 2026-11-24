<script lang="ts">
  import EmptyState from '../../components/EmptyState.svelte';
  import Header from '../../components/Header.svelte';
  import Icon from '../../components/Icon.svelte';
  import Tag from '../../components/Tag.svelte';
  import { buildTree } from '../../../core/groups.ts';
  import { formatAmount } from '../../../core/quantity.ts';
  import { isLowStock, sellRate } from '../../../core/stock.ts';
  import { app, localDate, view } from '../../data.svelte.ts';
  import { daysLeftText, recentMovements } from './logic.ts';
  import GroupHeader from './GroupHeader.svelte';
  import { flattenTree, loadCollapsed, saveCollapsed, toggleCollapsed } from './grouping.ts';

  const today = localDate();
  const classes = $derived(app.products.filter((c) => c.trackStock && !c.archived).sort((a, b) => a.name.localeCompare(b.name)));
  const items = $derived(
    classes.map((c) => {
      const s = view.snapshot.get(c.id);
      const stock = s?.stock ?? 0;
      const rate = sellRate(c.id, app.orders, today);
      return {
        name: c.name,
        group: c.group,
        cls: c,
        stock,
        low: isLowStock(c, stock),
        // Only real estimates on the list (D-016); "not enough data" stays on the detail page.
        left: rate.enoughData ? daysLeftText(c, stock, rate) : '',
      };
    }),
  );
  const tree = $derived(buildTree(items));
  let collapsed = $state(loadCollapsed(localStorage, 'stockCollapsed'));
  const rows = $derived(flattenTree(tree, { collapsed, force: () => false }));
  function toggle(path: string) {
    collapsed = toggleCollapsed(collapsed, path);
    saveCollapsed(localStorage, 'stockCollapsed', collapsed);
  }
  const recent = $derived(recentMovements(app.orders, app.stock, app.recipes, view.classesById, today));
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
      {#each rows as r (r.kind === 'group' ? `g:${r.node.path}` : r.item.cls.id)}
        {#if r.kind === 'group'}
          <GroupHeader name={r.node.name} count={r.node.count} open={r.open} depth={r.depth} ontoggle={() => toggle(r.node.path)} />
        {:else}
        {@const s = r.item}
        <a class="card stock-card" style:margin-left="{r.depth * 12}px" href="#/stock/{s.cls.id}">
          <div class="row-between">
            <span class="name">
              <span class="title">{s.cls.name}</span>
              {#if !s.cls.sellable}<Tag>raw material</Tag>{/if}
              {#if s.low}<Tag tone="low">Low</Tag>{/if}
            </span>
            <span class="qty" class:owed-text={s.stock < 0}>{formatAmount(s.stock, s.cls.unit.decimals, s.cls.unit.name)}</span>
          </div>
          {#if s.stock < 0}<span><Tag tone="negative">sold without stock</Tag></span>{:else if s.left}<span class="muted">{s.left}</span>{/if}
        </a>
        {/if}
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
              <span class="deltas">{#each m.deltas as d (d)}<span>{d}</span>{/each}</span>
            </span>
          </a>
        {:else}
          <p class="muted">No movements yet.</p>
        {/each}
      </div>
    </section>
  {/if}

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
  /* Under the title, full width: product names can be long (D-015). */
  .deltas {
    display: flex;
    flex-direction: column;
    font-size: var(--fs-small);
    font-weight: 600;
  }
  .new {
    min-height: var(--tap);
    display: inline-flex;
    align-items: center;
    font-weight: 600;
    text-decoration: none;
  }
  .toggle {
    min-height: var(--tap);
    font-weight: 600;
    padding: 0;
  }
  .edit {
    min-height: var(--tap);
    padding: 0 14px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--ink);
    font-weight: 600;
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
