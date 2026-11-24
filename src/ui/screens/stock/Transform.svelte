<script lang="ts">
  import { untrack } from 'svelte';
  import ConfirmSheet from '../../components/ConfirmSheet.svelte';
  import EmptyState from '../../components/EmptyState.svelte';
  import Header from '../../components/Header.svelte';
  import Icon from '../../components/Icon.svelte';
  import Segmented from '../../components/Segmented.svelte';
  import { averageCostAt, materialsCost, otherDifference, outputUnitCosts } from '../../../core/costs.ts';
  import { formatMoney, formatUnitCost } from '../../../core/money.ts';
  import { formatAmount, parseAmount } from '../../../core/quantity.ts';
  import { batch, parseBatches } from '../../../core/recipes.ts';
  import { stockWarnings, validateTransform } from '../../../core/stock.ts';
  import type { ClassAmount, Decimals } from '../../../core/types.ts';
  import { app, freshRecord, localDate, saveStockEvent, view } from '../../data.svelte.ts';
  import { liveName } from './grouping.ts';
  import { go } from '../../router.svelte.ts';
  import { showToast } from '../../toast.svelte.ts';
  import RecipeSheet from './RecipeSheet.svelte';
  import {
    cap,
    costsFromForm,
    equalPercents,
    movePreview,
    sharesToPercents,
    stepAmount,
    toInputText,
    activeRecipes,
    transformSummary,
    type CostForm,
  } from './logic.ts';

  // Transform runs a saved recipe a whole number of times (D-019): inputs follow the recipe,
  // outputs start at recipe × batches and can be corrected to the real yield.
  let { query = {} }: { params?: Record<string, string>; query?: Record<string, string> } = $props();

  // From a stock page (?input=), recipes using that product come first.
  const recipes = $derived.by(() => {
    const all = activeRecipes(app.recipes);
    const uses = (r: (typeof all)[number]) => r.inputs.some((x) => x.classId === query.input);
    return query.input ? [...all.filter(uses), ...all.filter((r) => !uses(r))] : all;
  });
  const decimalsOf = (id: string): Decimals => view.classesById.get(id)?.unit.decimals ?? 0;

  let recipeId = $state('');
  let batchesText = $state('1');
  let outTexts = $state<string[]>([]);
  let date = $state(localDate());
  let note = $state('');
  let form = $state<CostForm>({ opened: false, mode: 'breakdown', extras: [], totalText: '', shareTexts: ['100'] });
  let tried = $state(false);
  let confirm = $state(false);
  let newOpen = $state(false);

  const recipe = $derived(app.recipes.find((r) => r.id === recipeId && !r.archived));
  const batches = $derived(parseBatches(batchesText));
  const planned = $derived(recipe && batches ? batch(recipe, batches) : null);
  const centsText = (c: number) => (c / 100).toFixed(2);

  // Outputs and cost extras follow the recipe and batches; hand corrections stay until either changes.
  function reset() {
    const r = app.recipes.find((x) => x.id === recipeId && !x.archived);
    const n = parseBatches(batchesText);
    if (!r || !n) return;
    const p = batch(r, n);
    outTexts = p.outputs.map((o) => toInputText(o.amount, decimalsOf(o.classId)));
    const shares = r.shares.length === r.outputs.length ? sharesToPercents(r.shares) : equalPercents(r.outputs.length);
    form = { ...form, extras: p.extras.map((x) => ({ label: x.label, text: centsText(x.amount) })), shareTexts: shares };
  }
  function useRecipe(id: string) {
    recipeId = id;
    batchesText = '1';
    reset();
  }
  untrack(() => query.recipe && useRecipe(query.recipe));
  function setBatches(text: string) {
    batchesText = text;
    reset();
  }
  const stepBatches = (dir: 1 | -1) => setBatches(String(Math.max(1, (batches ?? 1) + dir)));
  function stepOut(i: number, dir: 1 | -1) {
    if (!recipe) return;
    const d = decimalsOf(recipe.outputs[i].classId);
    outTexts[i] = toInputText(stepAmount(parseAmount(outTexts[i] ?? '', d), d, dir), d);
  }

  const ins = $derived(planned?.inputs ?? []);
  const outAmounts = $derived((recipe?.outputs ?? []).map((o, i) => parseAmount(outTexts[i] ?? '', decimalsOf(o.classId))));
  const outs = $derived<ClassAmount[]>((recipe?.outputs ?? []).map((o, i) => ({ classId: o.classId, amount: outAmounts[i] ?? 0 })));
  const stockOf = (id: string) => view.snapshot.get(id)?.stock ?? 0;
  const fmt = (id: string, v: number) => {
    const c = view.classesById.get(id);
    return formatAmount(v, c?.unit.decimals ?? 0, c?.unit.name ?? '');
  };
  const unitOf = (id: string) => view.classesById.get(id)?.unit.name ?? '';
  const nameOf = (id: string) => liveName(view.classesById, id, '');

  // Materials at the transform date: current average for today or later, else the average up to that day.
  const today = localDate();
  function avgCostAt(classId: string) {
    const c = view.classesById.get(classId);
    if (!c) return null;
    if (date >= today) return view.snapshot.get(classId)?.avgCost ?? null;
    return averageCostAt(c, app.orders, app.stock, view.classesById, { date, createdAt: '~' }, app.purchases);
  }
  const mat = $derived(materialsCost(ins.filter((x) => x.amount > 0), avgCostAt, view.classesById));
  const costResult = $derived(costsFromForm(form, mat, outs.filter((x) => x.amount > 0)));
  const unitCosts = $derived(costResult.costs ? outputUnitCosts(costResult.costs, outs.filter((x) => x.amount > 0), view.classesById) : []);
  const shareSum = $derived(form.shareTexts.reduce((s, t) => s + (Number(t.replace(',', '.')) || 0), 0));

  const errors = $derived.by(() => {
    if (!recipe) return ['Choose a recipe.'];
    if (!batches) return ['Batches must be a whole number from 1.'];
    if (outAmounts.some((a) => a === null)) return ['Check the amounts made.'];
    return [
      ...validateTransform({ inputs: ins, outputs: outs }, view.classesById).map((e) => `${cap(e)}.`),
      ...(costResult.error ? [costResult.error] : []),
    ];
  });
  const warnings = $derived.by(() => {
    const delta = new Map<string, number>();
    for (const x of ins) delta.set(x.classId, (delta.get(x.classId) ?? 0) - x.amount);
    return stockWarnings(delta, view.snapshot);
  });
  const summary = $derived(transformSummary(ins, outs.filter((x) => x.amount > 0), view.classesById));

  function submit(e: SubmitEvent) {
    e.preventDefault();
    tried = true;
    if (errors.length) return;
    if (warnings.length) confirm = true;
    else void save();
  }

  async function save() {
    const costs = costResult.costs;
    await saveStockEvent({ ...freshRecord(), date, type: 'transform', inputs: ins, outputs: outs, recipeId, costs, note: note.trim(), voided: false });
    showToast(`Transformed: ${summary}`);
    go('#/stock');
  }
</script>

<Header title="Transform" back="#/stock" />

{#if !recipes.length}
  <div class="page">
    <EmptyState title="No recipes yet">
      <p>A transform runs a recipe: what it uses and what it makes. Create one first.</p>
      <button type="button" class="btn btn-primary" onclick={() => (newOpen = true)}>+ New recipe</button>
    </EmptyState>
  </div>
{:else}
  <form class="page form" onsubmit={submit} novalidate>
    <div class="field">
      <span class="label">Recipe</span>
      <div class="chips" role="group" aria-label="Recipe">
        {#each recipes as r (r.id)}
          <button type="button" class:on={recipeId === r.id} aria-pressed={recipeId === r.id} onclick={() => useRecipe(r.id)}>{r.name}</button>
        {/each}
        <button type="button" class="new" onclick={() => (newOpen = true)}>+ New recipe</button>
      </div>
    </div>

    {#if recipe}
    <div class="field">
      <label for="batches">Batches</label>
      <div class="amt">
        <button type="button" class="step" aria-label="One batch less" onclick={() => stepBatches(-1)}>−</button>
        <div class="suffix">
          <input id="batches" class="input" inputmode="numeric" autocomplete="off" value={batchesText} oninput={(e) => setBatches(e.currentTarget.value)} />
          <span aria-hidden="true">× recipe</span>
        </div>
        <button type="button" class="step" aria-label="One batch more" onclick={() => stepBatches(1)}>+</button>
      </div>
    </div>

    <section class="card">
      <h2>Uses</h2>
      {#each ins as x (x.classId)}
        {@const before = stockOf(x.classId)}
        <div class="row">
          <div class="row-between"><span>{nameOf(x.classId)}</span><b>{fmt(x.classId, x.amount)}</b></div>
          <span class="muted" class:owed-text={before - x.amount < 0}>In stock {fmt(x.classId, before)} → <b>{fmt(x.classId, before - x.amount)} left</b></span>
        </div>
      {/each}
    </section>

    <p class="yield" aria-live="polite">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v16M6 14l6 6 6-6"></path></svg>
      <span>{batches ? `${batches} × ${recipe.name}` : 'Set the batches'}</span>
    </p>

    <section class="card">
      <h2>Makes</h2>
      {#each recipe.outputs as o, i (o.classId)}
        {@const before = stockOf(o.classId)}
        <div class="row">
          <span>{nameOf(o.classId)}</span>
          <div class="amt">
            <button type="button" class="step" aria-label="Output {i + 1} less" onclick={() => stepOut(i, -1)}>−</button>
            <div class="suffix">
              <input class="input" inputmode="decimal" autocomplete="off" placeholder="0" aria-label="Output {i + 1} amount" bind:value={outTexts[i]} />
              <span aria-hidden="true">{unitOf(o.classId)}</span>
            </div>
            <button type="button" class="step" aria-label="Output {i + 1} more" onclick={() => stepOut(i, 1)}>+</button>
          </div>
          <span class="muted">In stock {fmt(o.classId, before)} → <b>{fmt(o.classId, movePreview(before, 'add', outAmounts[i]).after)}</b> · change it if the real yield differs</span>
        </div>
      {/each}
    </section>

    <details class="card costs" ontoggle={(e) => e.currentTarget.open && (form.opened = true)}>
      <summary><h2>Costs <span class="muted">(optional)</span></h2><Icon name="down" size={18} /></summary>
      <div class="costs-body">
        <Segmented
          label="Cost mode"
          bind:value={form.mode}
          options={[
            { value: 'breakdown', label: 'Breakdown' },
            { value: 'total', label: 'Total' },
          ]}
        />
        <div class="list">
          {#each mat.lines as l (l.classId)}
            <div class="list-row line">
              <span class="grow">{nameOf(l.classId)} <span class="muted">{fmt(l.classId, l.amount)} × {l.avgCost === null ? '?' : formatUnitCost(l.avgCost)}</span></span>
              <b>{l.cost === null ? 'unknown' : formatMoney(l.cost)}</b>
            </div>
          {:else}
            <p class="hint">Materials appear when the inputs have amounts.</p>
          {/each}
          <div class="list-row line">
            <span class="grow">Materials</span>
            <b>{formatMoney(mat.materials)}{mat.complete ? '' : ' (incomplete)'}</b>
          </div>
        </div>

        {#if form.mode === 'breakdown'}
          {#each form.extras as x, i (i)}
            <div class="extra">
              <input class="input" aria-label="Extra {i + 1} label" placeholder="Label" bind:value={x.label} />
              <input class="input" inputmode="decimal" aria-label="Extra {i + 1} amount in euros" placeholder="€" bind:value={x.text} />
              <button type="button" class="icon-btn" aria-label="Remove extra {i + 1}" onclick={() => form.extras.splice(i, 1)}><Icon name="close" size={18} /></button>
            </div>
          {/each}
          <div class="chips" role="group" aria-label="Add extra">
            {#each ['Electricity', 'Time', 'Other'] as label (label)}
              <button type="button" onclick={() => form.extras.push({ label: label === 'Other' ? '' : label, text: '' })}>+ {label}</button>
            {/each}
          </div>
        {:else}
          <div class="field">
            <label for="total">Total batch cost</label>
            <input id="total" class="input" inputmode="decimal" placeholder="€" bind:value={form.totalText} />
          </div>
          {#if costResult.costs}
            {@const other = otherDifference(costResult.costs)}
            <div class="row-between"><span>Other (difference)</span><b class:owed-text={other < 0}>{formatMoney(other)}</b></div>
            {#if other < 0}<p class="warning" role="status">Total is less than materials.</p>{/if}
          {/if}
        {/if}

        {#if outs.length > 1}
          <div class="field">
            <span class="label">Share of the cost per output</span>
            {#each outs as o, i (i)}
              <div class="share">
                <label for="share-{i}" class="grow">{nameOf(o.classId)}</label>
                <div class="suffix narrow">
                  <input id="share-{i}" class="input" inputmode="decimal" bind:value={form.shareTexts[i]} />
                  <span aria-hidden="true">%</span>
                </div>
              </div>
            {/each}
            <p class="hint" class:owed-text={Math.abs(shareSum - 100) > 1e-6}>Sum {String(Number(shareSum.toFixed(2)))}% (must be 100%)</p>
          </div>
        {/if}

        {#if costResult.costs}
          <div class="result">
            <b>Total {formatMoney(costResult.costs.total)}</b>
            {#each unitCosts as u (u.classId)}
              <span class="muted">{nameOf(u.classId)}: {formatUnitCost(u.unitCost)} / {unitOf(u.classId)}{u.estimate ? ' (estimate)' : ''}</span>
            {/each}
          </div>
        {/if}
      </div>
    </details>

    <div class="two">
      <div class="field">
        <label for="tdate">Date</label>
        <input id="tdate" class="input" type="date" bind:value={date} />
      </div>
      <div class="field">
        <label for="tnote">Note</label>
        <input id="tnote" class="input" placeholder="e.g. batch 47" bind:value={note} />
      </div>
    </div>

    {#if tried && errors.length}
      <div class="error" role="alert">
        {#each errors as e (e)}<p>{e}</p>{/each}
      </div>
    {/if}
    {#each warnings as w (w.classId)}
      <p class="warning" role="status">{nameOf(w.classId)} would be {fmt(w.classId, w.after)}.</p>
    {/each}

    <div class="sticky-footer">
      {#if ins.some((x) => x.amount > 0) && outs.some((x) => x.amount > 0)}<span class="summary">{summary}</span>{/if}
      <button type="submit" class="btn btn-block go"><Icon name="transform" size={20} />Transform</button>
    </div>
    {/if}
  </form>
{/if}

<RecipeSheet bind:open={newOpen} onsaved={(r) => useRecipe(r.id)} />

<ConfirmSheet bind:open={confirm} title="Go below zero?" confirmLabel="Transform anyway" onconfirm={save}>
  {#each warnings as w (w.classId)}
    <p>{nameOf(w.classId)} would be {fmt(w.classId, w.after)}.</p>
  {/each}
  <p>Save anyway?</p>
</ConfirmSheet>

<style>
  .form {
    padding-bottom: 170px;
  }
  h2 {
    margin: 0;
    font-size: var(--fs-section);
  }
  p {
    margin: 0;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .chips button {
    min-height: var(--tap);
    padding: 0 14px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--ink);
    font-size: 14px;
  }
  .chips .new {
    border-style: dashed;
    color: var(--accent);
    font-weight: 600;
  }
  .chips .on {
    background: var(--ink);
    border-color: var(--ink);
    color: var(--bg);
    font-weight: 600;
  }
  .row {
    display: grid;
    gap: 6px;
    padding: 10px 0;
    border-top: 1px solid var(--divider);
  }
  .amt {
    flex: 1 1 0;
    min-width: 0;
    display: flex;
    gap: 4px;
    align-items: center;
  }
  .amt .suffix {
    flex: 1;
    min-width: 0;
  }
  .step {
    flex: none;
    width: var(--tap);
    height: var(--tap);
    border-radius: var(--radius-control);
    border: 1px solid var(--border);
    background: var(--chip);
    color: var(--ink);
    font-size: 20px;
  }
  .suffix {
    position: relative;
  }
  .suffix input {
    padding-right: 44px;
    font-weight: 700;
  }
  .suffix span {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--muted);
    font-size: var(--fs-small);
  }
  .narrow {
    width: 110px;
  }
  .icon-btn {
    display: inline-grid;
    place-items: center;
    flex: none;
    width: var(--tap);
    height: var(--tap);
    border: 0;
    border-radius: var(--radius-control);
    background: transparent;
    color: var(--muted);
  }
  .yield {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 10px;
    color: var(--muted);
    font-size: var(--fs-small);
    font-weight: 600;
  }
  .costs summary {
    display: flex;
    justify-content: space-between;
    align-items: center;
    min-height: var(--tap);
    cursor: pointer;
    list-style: none;
  }
  .costs summary::-webkit-details-marker {
    display: none;
  }
  .costs[open] summary :global(svg) {
    transform: rotate(180deg);
  }
  .costs-body {
    display: grid;
    gap: 12px;
    padding-top: 8px;
  }
  .line {
    font-size: 14px;
    min-height: 0;
    padding: 8px 0;
  }
  .extra {
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) var(--tap);
    gap: 8px;
  }
  .share {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .result {
    display: grid;
    gap: 4px;
    padding-top: 8px;
    border-top: 1px solid var(--border);
  }
  .two {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .error {
    display: grid;
    gap: 4px;
  }
  .summary {
    text-align: center;
    font-weight: 600;
    font-size: 14px;
  }
  .go {
    background: var(--ink);
    border-color: var(--ink);
    color: var(--bg);
  }
</style>
