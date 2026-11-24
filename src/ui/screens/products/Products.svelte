<script lang="ts">
  import Header from '../../components/Header.svelte';
  import Icon from '../../components/Icon.svelte';
  import Tag from '../../components/Tag.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import EmptyState from '../../components/EmptyState.svelte';
  import { app, view, localDate, saveClass } from '../../data.svelte.ts';
  import { go } from '../../router.svelte.ts';
  import { showToast } from '../../toast.svelte.ts';
  import { formatUnitCost } from '../../../core/money.ts';
  import { formatAmount } from '../../../core/quantity.ts';
  import { isLowStock } from '../../../core/stock.ts';
  import { rangeFor, unitsSold, type ClassSold } from '../../../core/stats.ts';
  import { fullName, normalizeGroup, renameGroup, type GroupNode } from '../../../core/groups.ts';
  import type { ProductClass } from '../../../core/types.ts';
  import CustomFilter from './CustomFilter.svelte';
  import { filterByCustomField } from './customFilter.ts';
  import { priceLabel, sortClasses, sortedVariants } from './logic.ts';
  import { COLLAPSED_KEY, parseCollapsed, productTree, renameConflicts, toggleCollapsed } from './tree.ts';

  let showArchived = $state(false);
  let fieldKey = $state('');
  let fieldText = $state('');

  const sold = $derived(
    new Map<string, ClassSold>(unitsSold(app.orders, view.balances, rangeFor('month', localDate())).map((c) => [c.classId, c])),
  );
  const classes = $derived(sortClasses(app.products));
  const tree = $derived(productTree(classes, fieldKey, fieldText));
  const archived = $derived(filterByCustomField(classes.filter((c) => c.archived), fieldKey, fieldText));
  const archivedCount = $derived(classes.filter((c) => c.archived).length);

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
  <section class="card" class:archived={c.archived}>
    <a class="head" href="#/products/{c.id}" aria-label="Edit {fullName(c)}">
      <span class="row-between">
        <h2>{label}</h2>
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
      <div class="table" role="table" aria-label="Variants of {fullName(c)}">
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
{/snippet}

{#snippet node(n: GroupNode<ProductClass>)}
  {#each n.groups as g (g.path)}
    {@const open = !collapsed.includes(g.path)}
    <div class="group">
      <div class="ghead">
        <button type="button" class="gtoggle grow" aria-expanded={open} onclick={() => toggle(g.path)}>
          <span class="chev" class:open><Icon name="chevron" size={18} /></span>
          <span class="gname ellipsis">{g.name}</span>
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

  <CustomFilter {classes} bind:key={fieldKey} bind:text={fieldText} />

  {@render node(tree)}

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
  .group {
    display: grid;
    gap: 12px;
  }
  .ghead {
    display: flex;
    align-items: center;
    gap: 4px;
    border-bottom: 1px solid var(--divider);
  }
  .gtoggle {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    min-height: var(--tap);
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .gname {
    font-weight: 700;
    font-size: var(--fs-section);
  }
  .chev {
    display: inline-grid;
    color: var(--muted);
    transition: transform 0.15s;
  }
  .chev.open {
    transform: rotate(90deg);
  }
  .nested {
    display: grid;
    gap: 12px;
    padding-left: 14px;
    border-left: 2px solid var(--divider);
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
  .form {
    display: grid;
    gap: 12px;
  }
  p {
    margin: 0;
  }
</style>
