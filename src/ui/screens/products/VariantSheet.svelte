<script lang="ts">
  import Sheet from '../../components/Sheet.svelte';
  import Segmented from '../../components/Segmented.svelte';
  import { formatAmount } from '../../../core/quantity.ts';
  import { formatMoney } from '../../../core/money.ts';
  import type { Decimals, Variant, VariantKind } from '../../../core/types.ts';
  import { parseVariantForm, type VariantValue } from './logic.ts';

  // Bottom sheet to add or edit one variant of a class (§8.8).
  let {
    open = $bindable(false),
    unitName,
    decimals,
    siblings,
    variant = null,
    onsave,
  }: {
    open: boolean;
    unitName: string;
    decimals: Decimals;
    siblings: Variant[];
    variant?: Variant | null;
    onsave: (value: VariantValue, id: string | null) => void | Promise<void>;
  } = $props();

  let label = $state('');
  let kind = $state<VariantKind>('fixed');
  let amountText = $state('');
  let priceText = $state('');
  let costText = $state('');
  let tried = $state(false);
  let busy = $state(false);

  // Fill the form each time the sheet opens.
  $effect(() => {
    if (!open) return;
    tried = false;
    label = variant?.label ?? '';
    kind = variant?.kind ?? 'fixed';
    amountText = variant?.baseAmount != null ? formatAmount(variant.baseAmount, decimals) : '';
    priceText = variant ? (variant.price / 100).toFixed(2) : '';
    costText = variant?.cost != null ? String(variant.cost / 100) : '';
  });

  const parsed = $derived(parseVariantForm({ label, kind, amountText, priceText, costText }, decimals, siblings, variant?.id));
  const errors = $derived(tried ? parsed.errors : {});

  async function save() {
    tried = true;
    if (!parsed.value || busy) return;
    busy = true;
    try {
      await onsave(parsed.value, variant?.id ?? null);
      open = false;
    } finally {
      busy = false;
    }
  }
</script>

<Sheet bind:open title={variant ? 'Edit variant' : 'Add variant'}>
  <form
    class="form"
    onsubmit={(e) => {
      e.preventDefault();
      save();
    }}
  >
    <Segmented
      label="How is it sold?"
      bind:value={kind}
      options={[
        { value: 'fixed', label: 'Fixed amount' },
        { value: 'variable', label: 'Variable amount' },
      ]}
    />
    <p class="hint">
      {kind === 'fixed' ? 'Whole items: bottle, pack, box, piece.' : `Type the amount when selling, e.g. 1.37 ${unitName}.`}
    </p>

    <div class="field">
      <label for="v-label">Label</label>
      <input id="v-label" class="input" bind:value={label} maxlength="60" autocomplete="off" />
      {#if errors.label}<p class="error">{errors.label}</p>{/if}
    </div>

    {#if kind === 'fixed'}
      <div class="field">
        <label for="v-amount">Amount in one item ({unitName})</label>
        <input id="v-amount" class="input" bind:value={amountText} inputmode="decimal" autocomplete="off" />
        {#if errors.amount}<p class="error">{errors.amount}</p>{/if}
      </div>
    {/if}

    <div class="two">
      <div class="field">
        <label for="v-price">{kind === 'fixed' ? 'Price per item' : `Price per ${unitName}`}</label>
        <input id="v-price" class="input" bind:value={priceText} inputmode="decimal" placeholder="€" autocomplete="off" />
        {#if errors.price}<p class="error">{errors.price}</p>{/if}
      </div>
      <div class="field">
        <label for="v-cost">Cost (optional)</label>
        <input id="v-cost" class="input" bind:value={costText} inputmode="decimal" placeholder="Unknown" autocomplete="off" />
        {#if errors.cost}<p class="error">{errors.cost}</p>{/if}
      </div>
    </div>

    {#if parsed.value}
      <p class="hint">
        {#if parsed.value.kind === 'fixed' && parsed.value.baseAmount !== null}
          2 × {parsed.value.label} · {formatMoney(parsed.value.price)} each = {formatMoney(parsed.value.price * 2)}. Takes
          {formatAmount(parsed.value.baseAmount * 2, decimals, unitName)} from stock.
        {:else}
          {parsed.value.label} · 1 {unitName} × {formatMoney(parsed.value.price)}
        {/if}
      </p>
    {/if}
    <button type="submit" class="visually-hidden" tabindex="-1">Save</button>
  </form>
  {#snippet footer()}
    <button type="button" class="btn btn-primary btn-block" disabled={busy} onclick={save}>Save variant</button>
    <button type="button" class="btn btn-ghost btn-block" onclick={() => (open = false)}>Cancel</button>
  {/snippet}
</Sheet>

<style>
  .form {
    display: grid;
    gap: 14px;
  }
  .two {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .hint {
    margin: 0;
  }
</style>
