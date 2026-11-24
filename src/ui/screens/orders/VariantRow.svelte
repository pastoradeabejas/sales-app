<script lang="ts">
  import AmountSheet from '../../components/AmountSheet.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import Tag from '../../components/Tag.svelte';
  import { formatMoney, parseMoney } from '../../../core/money.ts';
  import { formatAmount } from '../../../core/quantity.ts';
  import type { Cents, ProductClass, Variant } from '../../../core/types.ts';
  import { defaultNote } from './logic.ts';

  // One variant in the order form: price (tap to edit for this order) and stepper or amount.
  let {
    cls,
    variant,
    qty,
    price,
    onqty,
    onprice,
  }: { cls: ProductClass; variant: Variant; qty: number; price: Cents; onqty: (n: number) => void; onprice: (c: Cents) => void } = $props();

  const name = $derived(`${cls.name} ${variant.label}`);
  const fixed = $derived(variant.kind === 'fixed');
  const note = $derived(defaultNote(price, variant));
  const archived = $derived(variant.archived || cls.archived);

  let editing = $state(false);
  let text = $state('');
  let error = $state('');
  let amountOpen = $state(false);

  function startEdit() {
    text = (price / 100).toFixed(2);
    error = '';
    editing = true;
  }

  function commit() {
    const c = parseMoney(text);
    if (c === null) {
      error = 'Enter a price from €0 to €1,000,000';
      return;
    }
    onprice(c);
    editing = false;
  }
</script>

<div class="row">
  <span class="grow">
    <span class="label-line">
      <span class="vlabel">{variant.label}</span>
      {#if archived}<Tag tone="neutral">archived</Tag>{/if}
      {#if price === 0}<Tag tone="credit">free</Tag>{/if}
    </span>
    {#if editing}
      <span class="price-edit">
        <label class="visually-hidden" for="price-{variant.id}">Price of {name} in €</label>
        <!-- svelte-ignore a11y_autofocus -->
        <input
          id="price-{variant.id}"
          class="input"
          inputmode="decimal"
          autocomplete="off"
          bind:value={text}
          autofocus
          onblur={commit}
          onkeydown={(e) => e.key === 'Enter' && commit()}
        />
        <span class="muted">{fixed ? 'each' : `/ ${cls.unit.name}`}</span>
      </span>
      {#if error}<span class="error">{error}</span>{/if}
    {:else}
      <button type="button" class="price" aria-label="Price {formatMoney(price)}, tap to change for this order" onclick={startEdit}>
        {formatMoney(price)}{fixed ? ' each' : ` / ${cls.unit.name}`}
      </button>
    {/if}
    {#if note}<span class="edited owed-text">● {note}</span>{/if}
  </span>
  {#if fixed}
    <Stepper bind:value={() => qty, (v) => onqty(v)} label={name} />
  {:else}
    <button type="button" class="btn amount-btn" class:set={qty > 0} onclick={() => (amountOpen = true)}>
      {qty > 0 ? formatAmount(qty, cls.unit.decimals, cls.unit.name) : `Add ${cls.unit.name}`}
    </button>
  {/if}
</div>

{#if !fixed}
  <AmountSheet bind:open={amountOpen} title={name} unitName={cls.unit.name} decimals={cls.unit.decimals} value={qty} onsave={onqty} />
{/if}

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 0;
    border-top: 1px solid var(--divider);
  }
  .label-line {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .vlabel {
    font-weight: 500;
  }
  .price {
    align-self: flex-start;
    min-height: var(--tap);
    padding: 0;
    border: 0;
    background: none;
    color: var(--muted);
    font-size: var(--fs-small);
    text-decoration: underline dotted;
    text-underline-offset: 3px;
    cursor: pointer;
  }
  .price-edit {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .price-edit .input {
    width: 110px;
    min-height: var(--tap);
  }
  .edited {
    font-size: 12px;
    font-weight: 600;
  }
  .amount-btn {
    min-width: 96px;
  }
  .amount-btn.set {
    border: 1.5px solid var(--accent);
    font-weight: 700;
  }
</style>
