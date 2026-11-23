<script lang="ts">
  import { untrack } from 'svelte';
  import ConfirmSheet from '../../components/ConfirmSheet.svelte';
  import EmptyState from '../../components/EmptyState.svelte';
  import Header from '../../components/Header.svelte';
  import Segmented from '../../components/Segmented.svelte';
  import { formatUnitCost, parseUnitCost } from '../../../core/money.ts';
  import { formatAmount, parseAmount } from '../../../core/quantity.ts';
  import { app, freshRecord, localDate, saveStockEvent, view } from '../../data.svelte.ts';
  import { go } from '../../router.svelte.ts';
  import { showToast } from '../../toast.svelte.ts';
  import ClassPicker from './ClassPicker.svelte';
  import { movePreview, REASONS, reasonValue } from './logic.ts';

  let { params = {}, query = {} }: { params?: Record<string, string>; query?: Record<string, string> } = $props();

  // Add | Remove (§8.10); switching keeps every field.
  let type = $state<'add' | 'remove'>(untrack(() => (params.route === 'stock-remove' ? 'remove' : 'add')));
  const classes = $derived(app.products.filter((c) => c.trackStock && !c.archived).sort((a, b) => a.name.localeCompare(b.name)));
  let classId = $state(untrack(() => query.class ?? ''));
  const cls = $derived(view.classesById.get(classId));
  let amountText = $state('');
  let date = $state(localDate());
  let costText = $state('');
  let reason = $state('');
  let otherText = $state('');
  let note = $state('');
  let tried = $state(false);
  let confirm = $state(false);

  $effect(() => {
    if (!classId && classes.length === 1) classId = classes[0].id;
  });

  const decimals = $derived(cls?.unit.decimals ?? 0);
  const unit = $derived(cls?.unit.name ?? '');
  const amount = $derived(amountText.trim() ? parseAmount(amountText, decimals) : null);
  const unitCost = $derived(costText.trim() ? parseUnitCost(costText) : null);
  const stock = $derived(cls ? (view.snapshot.get(cls.id)?.stock ?? 0) : 0);
  const preview = $derived(movePreview(stock, type, amount));
  const storedReason = $derived(reasonValue(reason, otherText));
  const fmt = (v: number) => formatAmount(v, decimals, unit);

  const errors = $derived({
    cls: cls ? '' : 'Choose a product.',
    amount: amount === null ? `Enter an amount in ${unit || 'its unit'} greater than 0.` : '',
    cost: type === 'add' && costText.trim() && unitCost === null ? 'Enter a cost in euros, e.g. 0,45.' : '',
    reason: type === 'remove' && !storedReason ? (reason === 'other' ? 'Describe the reason.' : 'Choose a reason.') : '',
    date: date ? '' : 'Choose a date.',
  });
  const valid = $derived(Object.values(errors).every((e) => !e));

  function submit(e: SubmitEvent) {
    e.preventDefault();
    tried = true;
    if (!valid) return;
    if (type === 'remove' && preview.after < 0) confirm = true;
    else void save();
  }

  async function save() {
    if (!cls || amount === null) return;
    await saveStockEvent({
      ...freshRecord(),
      date,
      type,
      classId: cls.id,
      amount,
      unitCost: type === 'add' ? unitCost : null,
      reason: type === 'remove' ? storedReason : '',
      note: note.trim(),
      voided: false,
    });
    showToast(`${type === 'add' ? 'Added' : 'Removed'} ${fmt(amount)} ${cls.name}`);
    go('#/stock');
  }
</script>

<Header title={type === 'add' ? 'Add stock' : 'Remove stock'} back="#/stock" />

{#if !classes.length}
  <div class="page">
    <EmptyState title="No products track stock">
      <p>Turn on stock tracking for a product first.</p>
      <a class="btn" href="#/products">Products</a>
    </EmptyState>
  </div>
{:else}
  <form class="page form" onsubmit={submit} novalidate>
    <Segmented
      label="Add or remove"
      bind:value={type}
      options={[
        { value: 'add', label: 'Add' },
        { value: 'remove', label: 'Remove' },
      ]}
    />

    <div class="field">
      <span class="label" id="cls-label">Product</span>
      <ClassPicker options={classes} bind:value={classId} label="Product" />
      {#if tried && errors.cls}<p class="error">{errors.cls}</p>{/if}
    </div>

    <div class="field">
      <label for="amount">Amount</label>
      <div class="suffix">
        <input id="amount" class="input big" inputmode="decimal" autocomplete="off" placeholder="0" bind:value={amountText} aria-invalid={tried && !!errors.amount} />
        <span aria-hidden="true">{unit}</span>
      </div>
      {#if tried && errors.amount}<p class="error">{errors.amount}</p>{/if}
    </div>

    {#if cls}
      <section class="preview" class:negative={preview.after < 0} aria-live="polite">
        <span class="muted">{cls.name}</span>
        <span class="amount">{fmt(preview.before)} → <span class:owed-text={preview.after < 0}>{fmt(preview.after)}</span></span>
      </section>
      {#if preview.reset}<p class="hint">Stock is negative: this add counts from 0 (negative reset to 0).</p>{/if}
      {#if type === 'remove' && preview.after < 0}<p class="warning" role="status">Stock would be {fmt(preview.after)}.</p>{/if}
    {/if}

    {#if type === 'remove'}
      <div class="field">
        <span class="label">Reason</span>
        <div class="chips" role="group" aria-label="Reason">
          {#each REASONS as r (r.value)}
            <button type="button" class:on={reason === r.value} aria-pressed={reason === r.value} onclick={() => (reason = r.value)}>{r.label}</button>
          {/each}
        </div>
        {#if reason === 'other'}
          <input class="input" aria-label="Other reason" placeholder="What happened?" bind:value={otherText} />
        {/if}
        {#if tried && errors.reason}<p class="error">{errors.reason}</p>{/if}
      </div>
    {:else}
      <div class="field">
        <label for="cost">Cost per {unit || 'unit'} (optional)</label>
        <input id="cost" class="input" inputmode="decimal" autocomplete="off" placeholder="e.g. €0.45" bind:value={costText} />
        {#if unitCost !== null}<p class="hint">{formatUnitCost(unitCost)} per {unit}</p>{/if}
        {#if tried && errors.cost}<p class="error">{errors.cost}</p>{/if}
      </div>
    {/if}

    <div class="two">
      <div class="field">
        <label for="date">Date</label>
        <input id="date" class="input" type="date" bind:value={date} />
        {#if tried && errors.date}<p class="error">{errors.date}</p>{/if}
      </div>
      <div class="field">
        <label for="note">Note</label>
        <input id="note" class="input" placeholder="Optional" bind:value={note} />
      </div>
    </div>

    <div class="sticky-footer">
      <button type="submit" class="btn btn-block" class:btn-primary={type === 'add'} class:remove={type === 'remove'}>
        {type === 'add' ? 'Add' : 'Remove'}{amount !== null ? ` ${fmt(amount)}` : ''}
      </button>
    </div>
  </form>
{/if}

<ConfirmSheet bind:open={confirm} title="Remove below zero?" confirmLabel="Remove anyway" danger onconfirm={save}>
  <p>{cls?.name} stock would be {fmt(preview.after)}. Save anyway?</p>
</ConfirmSheet>

<style>
  .form {
    padding-bottom: 120px;
  }
  .suffix {
    position: relative;
  }
  .suffix span {
    position: absolute;
    right: 14px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--muted);
    font-weight: 600;
  }
  .big {
    font-size: 28px;
    font-weight: 700;
    min-height: 60px;
    padding-right: 64px;
  }
  .preview {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    padding: 14px 16px;
    border-radius: var(--radius-card);
    background: var(--chip);
  }
  .preview.negative {
    background: var(--owed-bg);
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
    border: 1.5px solid var(--owed-on-bg);
    background: var(--owed-bg);
    color: var(--owed-on-bg);
    font-weight: 600;
  }
  .two {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .remove {
    background: var(--owed);
    border-color: var(--owed);
    color: var(--on-accent);
  }
  p {
    margin: 0;
  }
</style>
