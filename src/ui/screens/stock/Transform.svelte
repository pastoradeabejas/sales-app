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
  import { recipeYield } from '../../../core/recipes.ts';
  import { stockWarnings, validateTransform } from '../../../core/stock.ts';
  import type { ClassAmount, Decimals, Recipe } from '../../../core/types.ts';
  import { app, freshRecord, localDate, saveRecipe, saveStockEvent, view } from '../../data.svelte.ts';
  import { go } from '../../router.svelte.ts';
  import { showToast } from '../../toast.svelte.ts';
  import {
    cap,
    costsFromForm,
    editRow,
    equalPercents,
    movePreview,
    rowsFromList,
    sharesToPercents,
    transformSummary,
    type CostForm,
    type TRow,
  } from './logic.ts';

  let { query = {} }: { params?: Record<string, string>; query?: Record<string, string> } = $props();

  const MAX_ROWS = 5;
  const classes = $derived(app.products.filter((c) => c.trackStock && !c.archived).sort((a, b) => a.name.localeCompare(b.name)));
  const recipes = $derived(app.recipes.filter((r) => !r.archived).sort((a, b) => a.name.localeCompare(b.name)));
  const decimalsOf = (id: string): Decimals => view.classesById.get(id)?.unit.decimals ?? 0;
  const emptyRow = (classId = ''): TRow => ({ classId, text: '', base: null });

  let recipeId = $state('');
  let inputs = $state<TRow[]>([emptyRow(untrack(() => query.input ?? ''))]);
  let outputs = $state<TRow[]>([emptyRow()]);
  let date = $state(localDate());
  let note = $state('');
  let saveAs = $state(false);
  let recipeName = $state('');
  let form = $state<CostForm>({ opened: false, mode: 'breakdown', extras: [], totalText: '', shareTexts: ['100'] });
  let tried = $state(false);
  let confirm = $state(false);

  const centsText = (c: number) => (c / 100).toFixed(2);

  function useRecipe(id: string) {
    recipeId = id;
    const r: Recipe | undefined = app.recipes.find((x) => x.id === id);
    if (!r) {
      // Manual: keep the rows, stop scaling.
      inputs = inputs.map((x) => ({ ...x, base: null }));
      outputs = outputs.map((x) => ({ ...x, base: null }));
      return;
    }
    inputs = rowsFromList(r.inputs, decimalsOf);
    outputs = rowsFromList(r.outputs, decimalsOf);
    const shares = r.shares.length === r.outputs.length ? sharesToPercents(r.shares) : equalPercents(r.outputs.length);
    form = { ...form, extras: r.extras.map((x) => ({ label: x.label, text: centsText(x.amount) })), shareTexts: shares };
    saveAs = false;
  }
  untrack(() => query.recipe && useRecipe(query.recipe));

  function edit(side: 'in' | 'out', i: number, text: string) {
    const all = editRow([...inputs, ...outputs], side === 'in' ? i : inputs.length + i, text, decimalsOf);
    inputs = all.slice(0, inputs.length);
    outputs = all.slice(inputs.length);
  }
  function setClass(side: 'in' | 'out', i: number, classId: string) {
    const rows = side === 'in' ? inputs : outputs;
    rows[i] = { ...rows[i], classId, base: null };
  }
  function addRow(side: 'in' | 'out') {
    if (side === 'in') inputs.push(emptyRow());
    else {
      outputs.push(emptyRow());
      form.shareTexts = equalPercents(outputs.length);
    }
  }
  function removeRow(side: 'in' | 'out', i: number) {
    if (side === 'in') inputs.splice(i, 1);
    else {
      outputs.splice(i, 1);
      form.shareTexts = equalPercents(outputs.length);
    }
  }

  const amountOf = (r: TRow) => (r.classId && r.text.trim() ? parseAmount(r.text, decimalsOf(r.classId)) : null);
  const list = (rows: TRow[]): ClassAmount[] => rows.filter((r) => r.classId).map((r) => ({ classId: r.classId, amount: amountOf(r) ?? 0 }));
  const ins = $derived(list(inputs));
  const outs = $derived(list(outputs));
  const stockOf = (id: string) => view.snapshot.get(id)?.stock ?? 0;
  const fmt = (id: string, v: number) => {
    const c = view.classesById.get(id);
    return formatAmount(v, c?.unit.decimals ?? 0, c?.unit.name ?? '');
  };
  const unitOf = (id: string) => view.classesById.get(id)?.unit.name ?? '';
  const nameOf = (id: string) => view.classesById.get(id)?.name ?? '';

  const yieldText = $derived.by(() => {
    const i = ins[0];
    const o = outs[0];
    if (!i?.amount || !o?.amount) return '';
    const y = recipeYield(i, o, decimalsOf);
    return `${String(Number(y.toFixed(2)))} ${unitOf(o.classId)} per ${unitOf(i.classId)}`;
  });

  // Materials at the transform date: current average for today or later, else the average up to that day.
  const today = localDate();
  function avgCostAt(classId: string) {
    const c = view.classesById.get(classId);
    if (!c) return null;
    if (date >= today) return view.snapshot.get(classId)?.avgCost ?? null;
    return averageCostAt(c, app.orders, app.stock, view.classesById, { date, createdAt: '~' });
  }
  const mat = $derived(materialsCost(ins.filter((x) => x.amount > 0), avgCostAt, view.classesById));
  const costResult = $derived(costsFromForm(form, mat, outs.filter((x) => x.amount > 0)));
  const unitCosts = $derived(costResult.costs ? outputUnitCosts(costResult.costs, outs.filter((x) => x.amount > 0), view.classesById) : []);
  const shareSum = $derived(form.shareTexts.reduce((s, t) => s + (Number(t.replace(',', '.')) || 0), 0));

  const rowErrors = $derived(
    [...inputs, ...outputs].some((r) => !r.classId || amountOf(r) === null) ? 'Choose a product and an amount on every row.' : '',
  );
  const errors = $derived([
    ...(rowErrors ? [rowErrors] : []),
    ...validateTransform({ inputs: ins, outputs: outs }, view.classesById)
      .filter((e) => !rowErrors || !e.startsWith('amounts'))
      .map((e) => `${cap(e)}.`),
    ...(costResult.error ? [costResult.error] : []),
    ...(saveAs && !recipeId && !recipeName.trim() ? ['Give the recipe a name.'] : []),
  ]);
  const warnings = $derived.by(() => {
    const delta = new Map<string, number>();
    for (const x of ins) delta.set(x.classId, (delta.get(x.classId) ?? 0) - x.amount);
    return stockWarnings(delta, view.snapshot);
  });
  const summary = $derived(transformSummary(ins.filter((x) => x.amount > 0), outs.filter((x) => x.amount > 0), view.classesById));

  function submit(e: SubmitEvent) {
    e.preventDefault();
    tried = true;
    if (errors.length) return;
    if (warnings.length) confirm = true;
    else void save();
  }

  async function save() {
    const costs = costResult.costs;
    let usedRecipe = recipeId || null;
    if (saveAs && !recipeId) {
      const r = await saveRecipe({
        ...freshRecord(),
        name: recipeName.trim(),
        inputs: ins,
        outputs: outs,
        extras: costs?.mode === 'breakdown' ? costs.extras : [],
        shares: costs && outs.length > 1 ? costs.allocation : [],
        archived: false,
      });
      usedRecipe = r.id;
    }
    await saveStockEvent({ ...freshRecord(), date, type: 'transform', inputs: ins, outputs: outs, recipeId: usedRecipe, costs, note: note.trim(), voided: false });
    showToast(`Transformed: ${summary}`);
    go('#/stock');
  }
</script>

<Header title="Transform" back="#/stock" />

{#if classes.length < 2}
  <div class="page">
    <EmptyState title="Not enough products track stock">
      <p>A transform needs at least two products with stock tracking (one used, one made).</p>
      <a class="btn" href="#/products">Products</a>
    </EmptyState>
  </div>
{:else}
  <form class="page form" onsubmit={submit} novalidate>
    <div class="field">
      <span class="label">Recipe</span>
      <div class="chips" role="group" aria-label="Recipe">
        <button type="button" class:on={!recipeId} aria-pressed={!recipeId} onclick={() => useRecipe('')}>Manual</button>
        {#each recipes as r (r.id)}
          <button type="button" class:on={recipeId === r.id} aria-pressed={recipeId === r.id} onclick={() => useRecipe(r.id)}>{r.name}</button>
        {/each}
      </div>
    </div>

    {#snippet rows(side: 'in' | 'out', items: TRow[])}
      {#each items as r, i (i)}
        {@const amount = amountOf(r)}
        {@const before = stockOf(r.classId)}
        {@const after = side === 'in' ? before - (amount ?? 0) : movePreview(before, 'add', amount).after}
        <div class="row">
          <div class="row-main">
            <select
              class="input"
              aria-label="{side === 'in' ? 'Input' : 'Output'} {i + 1} product"
              value={r.classId}
              onchange={(e) => setClass(side, i, e.currentTarget.value)}
            >
              <option value="" disabled>Choose…</option>
              {#each classes as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
            </select>
            <div class="suffix">
              <input
                class="input"
                inputmode="decimal"
                autocomplete="off"
                placeholder="0"
                aria-label="{side === 'in' ? 'Input' : 'Output'} {i + 1} amount"
                value={r.text}
                oninput={(e) => edit(side, i, e.currentTarget.value)}
              />
              <span aria-hidden="true">{unitOf(r.classId)}</span>
            </div>
            {#if items.length > 1}
              <button type="button" class="icon-btn" aria-label="Remove row {i + 1}" onclick={() => removeRow(side, i)}><Icon name="close" size={18} /></button>
            {/if}
          </div>
          {#if r.classId}
            <span class="muted" class:owed-text={after < 0}>
              {#if side === 'in'}
                In stock {fmt(r.classId, before)} → <b>{fmt(r.classId, after)} left</b>
              {:else}
                In stock {fmt(r.classId, before)} → <b>{fmt(r.classId, after)}</b>
              {/if}
              {#if r.base !== null}· scales with the recipe{/if}
            </span>
          {/if}
        </div>
      {/each}
    {/snippet}

    <section class="card">
      <div class="section-head">
        <h2>Uses</h2>
        <button type="button" class="btn-ghost link" disabled={inputs.length >= MAX_ROWS} onclick={() => addRow('in')}>+ Add input</button>
      </div>
      {@render rows('in', inputs)}
    </section>

    <p class="yield" aria-live="polite">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v16M6 14l6 6 6-6"></path></svg>
      <span>{yieldText || (recipeId ? 'Amounts scale together' : 'Manual: set each amount by hand')}</span>
    </p>

    <section class="card">
      <div class="section-head">
        <h2>Makes</h2>
        <button type="button" class="btn-ghost link" disabled={outputs.length >= MAX_ROWS} onclick={() => addRow('out')}>+ Add output</button>
      </div>
      {@render rows('out', outputs)}
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

    {#if !recipeId}
      <label class="check">
        <input type="checkbox" bind:checked={saveAs} />
        Save these amounts as a new recipe
      </label>
      {#if saveAs}
        <div class="field">
          <label for="rname">Recipe name</label>
          <input id="rname" class="input" placeholder="e.g. Yogurt from milk" bind:value={recipeName} />
        </div>
      {/if}
    {/if}

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
  </form>
{/if}

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
  .chips .on {
    background: var(--ink);
    border-color: var(--ink);
    color: var(--bg);
    font-weight: 600;
  }
  .link {
    min-height: var(--tap);
    font-weight: 600;
    padding: 0;
  }
  .row {
    display: grid;
    gap: 6px;
    padding: 10px 0;
    border-top: 1px solid var(--divider);
  }
  .row-main {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .row-main select {
    flex: 1.3;
    min-width: 0;
  }
  .row-main .suffix {
    flex: 1;
    min-width: 0;
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
  .check {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: var(--tap);
    padding: 0 4px;
  }
  .check input {
    width: 20px;
    height: 20px;
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
