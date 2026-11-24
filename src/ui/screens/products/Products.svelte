<script lang="ts">
  import Header from '../../components/Header.svelte';
  import TabSwitch from '../../components/TabSwitch.svelte';
  import Icon from '../../components/Icon.svelte';
  import Tag from '../../components/Tag.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import EmptyState from '../../components/EmptyState.svelte';
  import { app, view, localDate, saveClass, saveRecipe } from '../../data.svelte.ts';
  import { go } from '../../router.svelte.ts';
  import { showToast } from '../../toast.svelte.ts';
  import { formatAmount } from '../../../core/quantity.ts';
  import { isLowStock } from '../../../core/stock.ts';
  import { rangeFor, unitsSold, type ClassSold } from '../../../core/stats.ts';
  import { fullName, normalizeGroup, renameGroup, type GroupNode } from '../../../core/groups.ts';
  import type { ProductClass, Recipe } from '../../../core/types.ts';
  import RecipeSheet from '../stock/RecipeSheet.svelte';
  import { activeRecipes, recipeNameError, transformSummary } from '../stock/logic.ts';
  import CustomFilter from './CustomFilter.svelte';
  import { filterByCustomField } from './customFilter.ts';
  import { costLabel, priceLabel, sortClasses, sortedVariants } from './logic.ts';
  import { COLLAPSED_KEY, VIEW_KEY, parseCollapsed, parseView, productTree, renameConflicts, toggleCollapsed } from './tree.ts';
  import { flattenTree } from '../stock/grouping.ts';

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

  // Recipes (moved here from Stock): list, edit, use, restore archived.
  const recipes = $derived(activeRecipes(app.recipes));
  const archivedRecipes = $derived(app.recipes.filter((r) => r.archived).sort((a, b) => a.name.localeCompare(b.name)));
  let showArchivedRecipes = $state(false);
  let sheetOpen = $state(false);
  let editing = $state<Recipe | null>(null);
  function openSheet(r: Recipe | null) {
    editing = r;
    sheetOpen = true;
  }
  async function restore(r: Recipe) {
    if (recipeNameError(r.name, app.recipes, r.id)) {
      showToast(`Archive the other recipe called ${r.name} first`);
      return;
    }
    await saveRecipe({ ...r, archived: false });
    showToast(`Restored ${r.name}`);
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
        {#if !c.sellable}<Tag>raw material</Tag>{/if}
        {#if c.trackStock && snap && isLowStock(c, snap.stock)}<Tag tone="low">Low</Tag>{/if}
      </span>
      {#if c.trackStock && snap}<span class="qty">{formatAmount(snap.stock, c.unit.decimals, c.unit.name)}</span>{/if}
    </div>
    <span class="muted">Sold this month: {formatAmount(s?.amount ?? 0, c.unit.decimals, c.unit.name)}</span>
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
    {:else}
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
      <tr><th>Product</th><th>Stock</th><th>Price</th><th>Cost</th></tr>
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
          <tr>
            <td style:padding-left={indent(r.depth)}>
              <a class="tname" href="#/products/{c.id}">{c.name}</a>
              {#if c.trackStock && snap && isLowStock(c, snap.stock)}<Tag tone="low">Low</Tag>{/if}
            </td>
            <td class="num">{c.trackStock && snap ? formatAmount(snap.stock, c.unit.decimals, c.unit.name) : '—'}</td>
            <td class="num">{vs.length === 1 ? priceLabel(vs[0], c.unit.name) : vs.length ? '' : '—'}</td>
            <td class="num">{costLabel(vs.length === 1 ? vs[0] : null, snap?.avgCost ?? null, c.unit.decimals, c.unit.name)}</td>
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

<Header title="Products">
  {#snippet actions()}
    <button type="button" class="btn view-btn" aria-label={viewMode === 'table' ? 'Card view' : 'Table view'} onclick={switchView}>
      <Icon name={viewMode === 'table' ? 'cards' : 'table'} />
    </button>
    <a class="btn btn-primary" href="#/products/new">+ New product</a>
  {/snippet}
</Header>
<TabSwitch side="products" />

<div class="page">
  {#if app.products.length === 0}
    <EmptyState title="Start by adding your first product">
      <a class="btn btn-primary" href="#/products/new">+ New product</a>
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

  <section class="card">
    <div class="section-head">
      <h2>Recipes</h2>
      <button type="button" class="btn-ghost new" onclick={() => openSheet(null)}>+ New</button>
    </div>
    <div class="list">
      {#each recipes as r (r.id)}
        <div class="list-row">
          <span class="grow">
            <span class="title">{r.name}</span>
            <span class="muted">{transformSummary(r.inputs, r.outputs, view.classesById)}</span>
          </span>
          <button type="button" class="edit" aria-label="View {r.name}" onclick={() => openSheet(r)}>View</button>
          <a class="use" href="#/stock/transform?recipe={r.id}" aria-label="Use {r.name}">Use</a>
        </div>
      {:else}
        <p class="muted">No recipes yet. Tick "Save as recipe" on a transform to keep one.</p>
      {/each}
    </div>
    {#if archivedRecipes.length}
      <button type="button" class="btn-ghost toggle" aria-expanded={showArchivedRecipes} onclick={() => (showArchivedRecipes = !showArchivedRecipes)}>
        {showArchivedRecipes ? 'Hide' : 'Show'} archived recipes ({archivedRecipes.length})
      </button>
      {#if showArchivedRecipes}
        <div class="list">
          {#each archivedRecipes as r (r.id)}
            <div class="list-row">
              <span class="grow">
                <span class="title">{r.name}</span>
                <span class="muted">{transformSummary(r.inputs, r.outputs, view.classesById)}</span>
              </span>
              <button type="button" class="edit" aria-label="Restore {r.name}" onclick={() => restore(r)}>Restore</button>
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  </section>
</div>

<RecipeSheet bind:open={sheetOpen} recipe={editing} />

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
  .form {
    display: grid;
    gap: 12px;
  }
  h2,
  p {
    margin: 0;
  }
  .new,
  .toggle {
    min-height: var(--tap);
    font-weight: 600;
  }
  .new {
    display: inline-flex;
    align-items: center;
  }
  .toggle {
    padding: 0;
  }
  .edit,
  .use {
    min-height: var(--tap);
    padding: 0 14px;
    border-radius: 10px;
    font-weight: 600;
  }
  .edit {
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--ink);
  }
  .use {
    background: var(--accent-soft);
    color: var(--accent-strong);
    display: inline-flex;
    align-items: center;
    text-decoration: none;
  }
</style>
