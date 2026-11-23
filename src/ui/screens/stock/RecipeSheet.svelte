<script lang="ts">
  import ConfirmSheet from '../../components/ConfirmSheet.svelte';
  import Icon from '../../components/Icon.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import { sharesValid } from '../../../core/costs.ts';
  import { parseMoney } from '../../../core/money.ts';
  import { parseAmount } from '../../../core/quantity.ts';
  import { validateTransform } from '../../../core/stock.ts';
  import type { ClassAmount, CostExtra, Decimals, Recipe } from '../../../core/types.ts';
  import { app, freshRecord, saveRecipe, view } from '../../data.svelte.ts';
  import { showToast } from '../../toast.svelte.ts';
  import { cap, equalPercents, percentsToShares, recipeNameError, sharesToPercents, stepAmount, toInputText } from './logic.ts';

  // Create or edit a recipe (§3.6a): name, 1-5 inputs and outputs, default extras and output shares.
  let { open = $bindable(false), recipe = null }: { open: boolean; recipe?: Recipe | null } = $props();

  type Row = { classId: string; text: string };
  const MAX_ROWS = 5;
  const classes = $derived(app.products.filter((c) => c.trackStock && !c.archived).sort((a, b) => a.name.localeCompare(b.name)));
  const decimalsOf = (id: string): Decimals => view.classesById.get(id)?.unit.decimals ?? 0;
  const unitOf = (id: string) => view.classesById.get(id)?.unit.name ?? '';
  const nameOf = (id: string) => view.classesById.get(id)?.name ?? '';
  const toRows = (xs: ClassAmount[]): Row[] => xs.map((x) => ({ classId: x.classId, text: toInputText(x.amount, decimalsOf(x.classId)) }));

  let name = $state('');
  let inputs = $state<Row[]>([]);
  let outputs = $state<Row[]>([]);
  let extras = $state<{ label: string; text: string }[]>([]);
  let shareTexts = $state<string[]>([]);
  let tried = $state(false);
  let archiving = $state(false);

  $effect(() => {
    if (!open) return;
    const r = recipe;
    name = r?.name ?? '';
    inputs = r ? toRows(r.inputs) : [{ classId: '', text: '' }];
    outputs = r ? toRows(r.outputs) : [{ classId: '', text: '' }];
    extras = r ? r.extras.map((x) => ({ label: x.label, text: (x.amount / 100).toFixed(2) })) : [];
    shareTexts = r && r.shares.length === r.outputs.length ? sharesToPercents(r.shares) : equalPercents(r ? r.outputs.length : 1);
    tried = false;
  });

  const amountOf = (r: Row) => (r.classId && r.text.trim() ? parseAmount(r.text, decimalsOf(r.classId)) : null);
  const list = (rows: Row[]): ClassAmount[] => rows.map((r) => ({ classId: r.classId, amount: amountOf(r) ?? 0 }));
  const shareSum = $derived(shareTexts.reduce((s, t) => s + (Number(t.replace(',', '.')) || 0), 0));

  function addRow(rows: Row[], isOut: boolean) {
    rows.push({ classId: '', text: '' });
    if (isOut) shareTexts = equalPercents(rows.length);
  }
  function removeRow(rows: Row[], i: number, isOut: boolean) {
    rows.splice(i, 1);
    if (isOut) shareTexts = equalPercents(rows.length);
  }
  function step(r: Row, dir: 1 | -1) {
    r.text = toInputText(stepAmount(amountOf(r), decimalsOf(r.classId), dir), decimalsOf(r.classId));
  }

  const nameError = $derived(recipeNameError(name, app.recipes, recipe?.id ?? null));
  const built = $derived.by(() => {
    const errors: string[] = [];
    if ([...inputs, ...outputs].some((r) => !r.classId || amountOf(r) === null)) errors.push('Choose a product and an amount on every row.');
    const ins = list(inputs);
    const outs = list(outputs);
    for (const e of validateTransform({ inputs: ins, outputs: outs }, view.classesById)) {
      if (!(errors.length && e.startsWith('amounts'))) errors.push(`${cap(e)}.`);
    }
    const kept: CostExtra[] = [];
    for (const x of extras) {
      if (!x.text.trim()) continue;
      const amount = parseMoney(x.text);
      if (amount === null) {
        errors.push('Check the extra cost amounts.');
        break;
      }
      kept.push({ label: x.label.trim() || 'Other', amount });
    }
    let shares: Recipe['shares'] = [];
    if (outs.length > 1) {
      const s = percentsToShares(outs.map((o) => o.classId), shareTexts);
      if (!s || !sharesValid(s)) errors.push('Shares must add up to 100%.');
      else shares = s;
    }
    return { errors, ins, outs, extras: kept, shares };
  });

  async function save(e: SubmitEvent) {
    e.preventDefault();
    tried = true;
    if (nameError || built.errors.length) return;
    const base = recipe ?? { ...freshRecord(), archived: false };
    await saveRecipe({ ...base, name: name.trim(), inputs: built.ins, outputs: built.outs, extras: built.extras, shares: built.shares });
    showToast(recipe ? 'Recipe saved' : 'Recipe added');
    open = false;
  }

  async function archive() {
    if (!recipe) return;
    await saveRecipe({ ...recipe, archived: true });
    showToast(`Archived ${recipe.name}`);
    open = false;
  }
</script>

{#snippet rowsEditor(rows: Row[], isOut: boolean)}
  {#each rows as r, i (i)}
    {@const label = `${isOut ? 'Output' : 'Input'} ${i + 1}`}
    <div class="row">
      <select class="input" aria-label="{label} product" bind:value={r.classId}>
        <option value="" disabled>Choose…</option>
        {#each classes as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
      </select>
      <div class="amt">
        <button type="button" class="step" aria-label="{label} less" onclick={() => step(r, -1)}>−</button>
        <div class="suffix">
          <input class="input" inputmode="decimal" autocomplete="off" placeholder="0" aria-label="{label} amount" bind:value={r.text} />
          <span aria-hidden="true">{unitOf(r.classId)}</span>
        </div>
        <button type="button" class="step" aria-label="{label} more" onclick={() => step(r, 1)}>+</button>
        {#if rows.length > 1}
          <button type="button" class="step plain" aria-label="Remove {label.toLowerCase()}" onclick={() => removeRow(rows, i, isOut)}><Icon name="close" size={18} /></button>
        {/if}
      </div>
    </div>
  {/each}
{/snippet}

<Sheet bind:open title={recipe ? 'Edit recipe' : 'New recipe'}>
  <form id="recipe-form" class="form" onsubmit={save} novalidate>
    <div class="field">
      <label for="r-name">Name</label>
      <input id="r-name" class="input" placeholder="e.g. Yogurt from milk" bind:value={name} aria-invalid={tried && !!nameError} />
      {#if tried && nameError}<p class="error">{nameError}</p>{/if}
    </div>

    <section class="group">
      <div class="section-head">
        <h3>Uses</h3>
        <button type="button" class="btn-ghost link" disabled={inputs.length >= MAX_ROWS} onclick={() => addRow(inputs, false)}>+ Add input</button>
      </div>
      {@render rowsEditor(inputs, false)}
    </section>

    <section class="group">
      <div class="section-head">
        <h3>Makes</h3>
        <button type="button" class="btn-ghost link" disabled={outputs.length >= MAX_ROWS} onclick={() => addRow(outputs, true)}>+ Add output</button>
      </div>
      {@render rowsEditor(outputs, true)}
    </section>

    <section class="group">
      <div class="section-head">
        <h3>Default extras <span class="muted">(optional)</span></h3>
        <button type="button" class="btn-ghost link" onclick={() => extras.push({ label: '', text: '' })}>+ Add extra</button>
      </div>
      {#each extras as x, i (i)}
        <div class="extra">
          <input class="input" aria-label="Extra {i + 1} label" placeholder="Label" bind:value={x.label} />
          <input class="input" inputmode="decimal" aria-label="Extra {i + 1} amount in euros" placeholder="€" bind:value={x.text} />
          <button type="button" class="step plain" aria-label="Remove extra {i + 1}" onclick={() => extras.splice(i, 1)}><Icon name="close" size={18} /></button>
        </div>
      {/each}
    </section>

    {#if outputs.length > 1}
      <section class="group">
        <h3>Share of the cost per output</h3>
        {#each outputs as o, i (i)}
          <div class="share">
            <label for="rs-{i}" class="grow">{nameOf(o.classId) || `Output ${i + 1}`}</label>
            <div class="suffix narrow">
              <input id="rs-{i}" class="input" inputmode="decimal" bind:value={shareTexts[i]} />
              <span aria-hidden="true">%</span>
            </div>
          </div>
        {/each}
        <p class="hint" class:owed-text={Math.abs(shareSum - 100) > 1e-6}>Sum {String(Number(shareSum.toFixed(2)))}% (must be 100%)</p>
      </section>
    {/if}

    {#if tried && built.errors.length}
      <div class="error" role="alert">
        {#each built.errors as e (e)}<p>{e}</p>{/each}
      </div>
    {/if}

    <button type="submit" class="btn btn-primary btn-block">Save recipe</button>
    {#if recipe}
      <button type="button" class="btn btn-danger btn-block" onclick={() => (archiving = true)}>Archive recipe</button>
    {/if}
  </form>
</Sheet>

<ConfirmSheet bind:open={archiving} title="Archive recipe?" confirmLabel="Archive" danger onconfirm={archive}>
  <p>Past transforms keep their values.</p>
</ConfirmSheet>

<style>
  .form {
    display: grid;
    gap: 14px;
  }
  p,
  h3 {
    margin: 0;
  }
  h3 {
    font-size: var(--fs-section);
  }
  .group {
    display: grid;
    gap: 8px;
  }
  .link {
    min-height: var(--tap);
    font-weight: 600;
    padding: 0;
  }
  .row {
    display: grid;
    gap: 6px;
  }
  .amt {
    display: flex;
    gap: 4px;
    align-items: center;
  }
  .amt .suffix {
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
  .step {
    display: inline-grid;
    place-items: center;
    flex: none;
    width: var(--tap);
    height: var(--tap);
    border-radius: var(--radius-control);
    border: 1px solid var(--border);
    background: var(--chip);
    color: var(--ink);
    font-size: 20px;
  }
  .step.plain {
    border-color: transparent;
    background: transparent;
    color: var(--muted);
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
  .error {
    display: grid;
    gap: 4px;
  }
</style>
