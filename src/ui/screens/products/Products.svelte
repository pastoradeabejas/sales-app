<script lang="ts">
  import Header from '../../components/Header.svelte';
  import TabSwitch from '../../components/TabSwitch.svelte';
  import Icon from '../../components/Icon.svelte';
  import Tag from '../../components/Tag.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import EmptyState from '../../components/EmptyState.svelte';
  import { app, view, localDate, saveClass } from '../../data.svelte.ts';
  import { go } from '../../router.svelte.ts';
  import { showToast } from '../../toast.svelte.ts';
  import { formatAmount } from '../../../core/quantity.ts';
  import { formatMoney } from '../../../core/money.ts';
  import { isExpenseItem } from '../../../core/purchases.ts';
  import { isLowStock } from '../../../core/stock.ts';
  import { rangeFor, unitsSold, type ClassSold } from '../../../core/stats.ts';
  import { fullName, normalizeGroup, renameGroup, type GroupNode } from '../../../core/groups.ts';
  import type { ProductClass } from '../../../core/types.ts';
  import CustomFilter from './CustomFilter.svelte';
  import { filterByCustomField } from './customFilter.ts';
  import { costLabel, expenseFigures, priceLabel, sideClasses, sortClasses, sortedVariants, type ClassSide } from './logic.ts';
  import { COLLAPSED_KEY, VIEW_KEY, parseCollapsed, parseView, productTree, renameConflicts, toggleCollapsed } from './tree.ts';
  import { flattenTree } from '../stock/grouping.ts';

  let { params = {} }: { params?: Record<string, string>; query?: Record<string, string> } = $props();
  const side = $derived<ClassSide>(params.route === 'stock' ? 'stock' : params.route === 'expense-items' ? 'expenses' : 'products');
  const newHref = $derived(side === 'expenses' ? '#/products/new?kind=expense' : '#/products/new');

  let showArchived = $state(false);
  let fieldKey = $state('');
  let fieldText = $state('');

  const today = localDate();
  const sold = $derived(
    new Map<string, ClassSold>(unitsSold(app.orders, view.balances, rangeFor('month', today)).map((c) => [c.classId, c])),
  );
  const classes = $derived(sortClasses(sideClasses(app.products, side)));
  const tree = $derived(productTree(classes, fieldKey, fieldText));
  const archived = $derived(filterByCustomField(classes.filter((c) => c.archived), fieldKey, fieldText));
  const archivedCount = $derived(classes.filter((c) => c.archived).length);

  // Cards or a booktabs-style table (D-017), kept per device.
  function readView() {
    try {
      return parseView(localStorage.getItem(VIEW_KEY));
    } catch {
      return 'cards';
    }
  }
  let viewMode = $state(readView());
  function switchView() {
    viewMode = viewMode === 'table' ? 'cards' : 'table';
    try {
      localStorage.setItem(VIEW_KEY, viewMode);
    } catch {
      // Storage blocked: the view still switches for this visit.
    }
  }

  // Collapsed groups, kept per device.
  function readCollapsed(): string[] {
    try {
      return parseCollapsed(localStorage.getItem(COLLAPSED_KEY));
    } catch {
      return [];
    }
  }
  let collapsed = $state(readCollapsed());
  function toggle(path: string) {
    collapsed = toggleCollapsed(collapsed, path);
    persist();
  }
  function persist() {
    try {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify(collapsed));
    } catch {
      // Storage blocked: the state still works for this visit.
    }
  }

  const tableRows = $derived(flattenTree(tree, { collapsed: new Set(collapsed), force: () => false }));
  const indent = (depth: number) => `${4 + depth * 14}px`;

  // Group menu: "+ Product here" or rename / move.
  let menuOpen = $state(false);
  let menuPath = $state('');
  let renaming = $state(false);
  let pathText = $state('');
  let tried = $state(false);
  function openMenu(path: string) {
    menuPath = path;
    pathText = path;
    renaming = false;
    tried = false;
    menuOpen = true;
  }
  const target = $derived(normalizeGroup(pathText));
  const renameError = $derived.by(() => {
    if (target === menuPath) return 'Enter a different path';
    const clash = renameConflicts(app.products, menuPath, target);
    return clash.length ? `Already in the target group: ${clash.join(', ')}` : null;
  });
  async function applyRename(e: SubmitEvent) {
    e.preventDefault();
    tried = true;
    if (renameError) return;
    const moved = app.products.filter((c) => renameGroup(c.group ?? '', menuPath, target) !== normalizeGroup(c.group));
    for (const c of moved) {
      await saveClass({ ...($state.snapshot(c) as ProductClass), group: renameGroup(c.group ?? '', menuPath, target) });
    }
    collapsed = collapsed.map((p) => renameGroup(p, menuPath, target));
    persist();
    showToast(`Moved ${moved.length} product${moved.length === 1 ? '' : 's'}`);
    menuOpen = false;
  }
</script>

{#snippet card(c: ProductClass, label: string)}
  {@const snap = view.snapshot.get(c.id)}
  {@const s = sold.get(c.id)}
  <a class="card pcard" class:archived={c.archived} href="#/products/{c.id}" aria-label="Edit {fullName(c)}">
    <div class="row-between">
      <span class="name">
        <span class="title">{label}</span>
        {#if c.archived}<Tag>Archived</Tag>{/if}
        {#if !c.sellable && c.trackStock}<Tag>raw material</Tag>{/if}
        {#if c.trackStock && snap && isLowStock(c, snap.stock)}<Tag tone="low">Low</Tag>{/if}
      </span>
      {#if c.trackStock && snap}<span class="qty">{formatAmount(snap.stock, c.unit.decimals, c.unit.name)}</span>{/if}
    </div>
    {#if isExpenseItem(c)}
      {@const f = expenseFigures(app.purchases, c.id, today)}
      <span class="muted">Last paid {f.last === null ? '—' : formatMoney(f.last)} · this month {formatMoney(f.month)} · this year {formatMoney(f.year)}</span>
    {:else}<span class="muted">Sold this month: {formatAmount(s?.amount ?? 0, c.unit.decimals, c.unit.name)}</span>{/if}
    {#if c.variants.length}
      <div class="variants" role="table" aria-label="Variants of {fullName(c)}">
        {#each sortedVariants(c.variants) as v (v.id)}
          {@const vs = s?.variants.find((x) => x.variantId === v.id)}
          <div class="vrow" class:greyed={v.archived} role="row">
            <span role="cell" class="lbl">{v.label}{v.archived ? ' · archived' : ''}</span>
            <span role="cell">{priceLabel(v, c.unit.name)}{#if v.price === 0} <Tag>free</Tag>{/if}</span>
            <span role="cell" class="amount">
              {v.kind === 'fixed' ? (vs?.quantity ?? 0) : formatAmount(vs?.amount ?? 0, c.unit.decimals, c.unit.name)}
            </span>
          </div>
        {/each}
      </div>
    {:else if !isExpenseItem(c)}
      <span class="muted">{c.sellable ? 'No variants yet' : 'Not sold · used in transforms'}</span>
    {/if}
  </a>
{/snippet}

{#snippet node(n: GroupNode<ProductClass>)}
  {#each n.groups as g (g.path)}
    {@const open = !collapsed.includes(g.path)}
    <div class="group">
      <div class="ghead">
        <button type="button" class="gtoggle" aria-expanded={open} onclick={() => toggle(g.path)}>
          <Icon name={open ? 'up' : 'down'} size={18} />
          <span class="title ellipsis grow">{g.name}</span>
          <span class="muted">{g.count}</span>
        </button>
        <button type="button" class="icon" aria-label="Group {g.name} actions" onclick={() => openMenu(g.path)}>
          <Icon name="more" />
        </button>
      </div>
      {#if open}
        <div class="nested">{@render node(g)}</div>
      {/if}
    </div>
  {/each}
  {#each n.items as c (c.id)}{@render card(c, c.name)}{/each}
{/snippet}

{#snippet table()}
  <table class="booktabs">
    <thead>
      {#if side === 'expenses'}
        <tr><th>Item</th><th>Last paid</th><th>Month</th><th>Year</th></tr>
      {:else}
        <tr><th>Product</th><th>Stock</th><th>Price</th><th>Cost</th></tr>
      {/if}
    </thead>
    <tbody>
      {#each tableRows as r (r.kind === 'group' ? `g:${r.node.path}` : r.item.id)}
        {#if r.kind === 'group'}
          <tr class="tgroup" class:top={r.depth === 0}>
            <td colspan="4" style:padding-left={indent(r.depth)}>
              <span class="tghead">
                <button type="button" class="tgtoggle" aria-expanded={r.open} onclick={() => toggle(r.node.path)}>
                  <Icon name={r.open ? 'up' : 'down'} size={14} />
                  <span class="ellipsis">{r.node.name}</span>
                  <span class="muted">({r.node.count})</span>
                </button>
                <button type="button" class="tmore" aria-label="Group {r.node.name} actions" onclick={() => openMenu(r.node.path)}>
                  <Icon name="more" size={16} />
                </button>
              </span>
            </td>
          </tr>
        {:else}
          {@const c = r.item}
          {@const snap = view.snapshot.get(c.id)}
          {@const vs = sortedVariants(c.variants)}
          {@const exp = isExpenseItem(c)}
          <tr>
            <td style:padding-left={indent(r.depth)}>
              <a class="tname" href="#/products/{c.id}">{c.name}</a>
              {#if c.trackStock && snap && isLowStock(c, snap.stock)}<Tag tone="low">Low</Tag>{/if}
            </td>
            {#if exp}
              {@const f = expenseFigures(app.purchases, c.id, today)}
              <td class="num">{f.last === null ? '—' : formatMoney(f.last)}</td>
              <td class="num">{formatMoney(f.month)}</td>
              <td class="num">{formatMoney(f.year)}</td>
            {:else}
            <td class="num">{c.trackStock && snap ? formatAmount(snap.stock, c.unit.decimals, c.unit.name) : '—'}</td>
            <td class="num">{exp ? '—' : vs.length === 1 ? priceLabel(vs[0], c.unit.name) : vs.length ? '' : '—'}</td>
            <td class="num">{exp ? '—' : costLabel(vs.length === 1 ? vs[0] : null, snap?.avgCost ?? null, c.unit.decimals, c.unit.name)}</td>
            {/if}
          </tr>
          {#if vs.length > 1}
            {#each vs as v (v.id)}
              <tr class="tvariant" class:greyed={v.archived}>
                <td style:padding-left={indent(r.depth + 1)}>{v.label}</td>
                <td></td>
                <td class="num">{priceLabel(v, c.unit.name)}</td>
                <td class="num">{costLabel(v, snap?.avgCost ?? null, c.unit.decimals, c.unit.name)}</td>
              </tr>
            {/each}
          {/if}
        {/if}
      {/each}
    </tbody>
  </table>
{/snippet}

<Header title={side === 'stock' ? 'Stock' : side === 'expenses' ? 'Expenses' : 'Products'}>
  {#snippet actions()}
    <button type="button" class="btn view-btn" aria-label={viewMode === 'table' ? 'Card view' : 'Table view'} onclick={switchView}>
      <Icon name={viewMode === 'table' ? 'cards' : 'table'} />
    </button>
    <a class="btn btn-primary" href={newHref}>{side === 'expenses' ? '+ New expense item' : '+ New product'}</a>
  {/snippet}
</Header>
<TabSwitch side={side === 'expenses' ? 'expense-items' : side} />

<div class="page">
  {#if side !== 'expenses'}
  <section class="big-actions">
    <a class="big b-add" href="#/stock/add"><Icon name="plus" size={24} />Add</a>
    <a class="big b-tr" href="#/stock/transform"><Icon name="transform" size={24} />Transform</a>
    <a class="big b-remove" href="#/stock/remove"><Icon name="minus" size={24} />Remove</a>
  </section>
  {/if}

  {#if classes.length === 0}
    <EmptyState title={side === 'stock' ? 'No raw materials or packaging yet' : side === 'expenses' ? 'No expense items yet' : 'Start by adding your first product'}>
      <a class="btn btn-primary" href={newHref}>{side === 'expenses' ? '+ New expense item' : '+ New product'}</a>
    </EmptyState>
  {/if}

  <CustomFilter {classes} bind:key={fieldKey} bind:text={fieldText} />

  {#if viewMode === 'table'}{@render table()}{:else}{@render node(tree)}{/if}

  {#if showArchived}
    {#each archived as c (c.id)}{@render card(c, fullName(c))}{/each}
  {/if}

  {#if archivedCount > 0}
    <button type="button" class="btn btn-ghost" onclick={() => (showArchived = !showArchived)}>
      {showArchived ? 'Hide archived' : `Show archived (${archivedCount})`}
    </button>
  {/if}

</div>


<Sheet bind:open={menuOpen} title={menuPath.split('/').join(' - ')}>
  {#if renaming}
    <form class="form" onsubmit={applyRename} novalidate>
      <div class="field">
        <label for="g-path">Group path</label>
        <input id="g-path" class="input" bind:value={pathText} autocomplete="off" aria-invalid={tried && !!renameError} />
        <p class="hint">Use / for subgroups, e.g. Honey/Rosemary. Empty = top level. Subgroups move along.</p>
        {#if tried && renameError}<p class="error">{renameError}</p>{/if}
      </div>
      <button type="submit" class="btn btn-primary btn-block">Rename / move</button>
    </form>
  {:else}
    <div class="form">
      <button type="button" class="btn btn-block" onclick={() => (renaming = true)}>Rename / move group</button>
      <button
        type="button"
        class="btn btn-block"
        onclick={() => {
          menuOpen = false;
          go(`#/products/new?group=${encodeURIComponent(menuPath)}`);
        }}>+ Product here</button
      >
    </div>
  {/if}
</Sheet>

<style>
  .view-btn {
    min-width: var(--tap);
    padding: 0 10px;
  }
  /* LaTeX booktabs look (D-017): serif, top/bottom rules, a mid rule, no vertical lines. */
  .booktabs {
    width: 100%;
    border-collapse: collapse;
    font-family: 'Latin Modern Roman', 'CMU Serif', Georgia, 'Times New Roman', serif;
    font-size: var(--fs-small);
    color: var(--ink);
    border-top: 2px solid var(--ink);
    border-bottom: 2px solid var(--ink);
  }
  .booktabs th {
    padding: 8px 4px 6px;
    text-align: right;
    font-weight: 700;
    border-bottom: 1px solid var(--ink);
  }
  .booktabs th:first-child {
    text-align: left;
  }
  .booktabs td {
    padding: 5px 4px;
    vertical-align: baseline;
  }
  .num {
    text-align: right;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .tgroup td {
    padding-top: 8px;
  }
  .tgroup.top:not(:first-child) td {
    border-top: 1px solid var(--divider);
  }
  .tghead {
    display: flex;
    align-items: center;
  }
  .tgtoggle {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    min-height: 32px;
    padding: 0;
    border: 0;
    background: none;
    font-weight: 700;
    font-style: italic;
    text-align: left;
    cursor: pointer;
  }
  .tgroup.top .tgtoggle {
    font-style: normal;
  }
  .tmore {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border: 0;
    background: none;
    color: var(--muted);
    cursor: pointer;
  }
  .tname {
    color: inherit;
    text-decoration: none;
    margin-right: 6px;
  }
  .tvariant td {
    color: var(--muted);
    padding-top: 1px;
    padding-bottom: 1px;
  }
  .pcard {
    display: grid;
    gap: 6px;
    padding: 14px 16px;
    color: var(--ink);
    text-decoration: none;
  }
  .pcard .row-between {
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
  .vrow {
    display: grid;
    grid-template-columns: minmax(0, 1.6fr) minmax(0, 1.2fr) minmax(0, 0.6fr);
    gap: 6px;
    align-items: center;
    padding: 6px 0;
    border-top: 1px solid var(--divider);
    font-size: var(--fs-small);
  }
  .vrow > span:nth-child(n + 2) {
    text-align: right;
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
  .group,
  .nested {
    display: grid;
    gap: 8px;
  }
  .nested {
    padding-left: 12px;
  }
  .ghead {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .gtoggle {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    min-height: var(--tap);
    padding: 0 4px;
    border: 0;
    background: none;
    color: var(--ink);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .icon {
    display: grid;
    place-items: center;
    width: var(--tap);
    height: var(--tap);
    flex: none;
    border: 0;
    border-radius: var(--radius-control);
    background: transparent;
    color: var(--muted);
    cursor: pointer;
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
  .b-add {
    background: var(--accent);
    color: var(--on-accent);
  }
  .b-tr {
    background: var(--ink);
    color: var(--bg);
  }
  .b-remove {
    background: var(--surface);
    border-color: var(--border);
    color: var(--owed);
  }
  .form {
    display: grid;
    gap: 12px;
  }
  p {
    margin: 0;
  }
</style>
