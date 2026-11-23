<script lang="ts">
  import Sheet from './Sheet.svelte';
  import { formatAmount, parseAmount } from '../../core/quantity.ts';
  import type { Decimals } from '../../core/types.ts';

  // Numeric sheet for variable amounts: unit suffix, decimal comma (§8.4, §9).
  let {
    open = $bindable(false),
    title,
    unitName,
    decimals,
    value,
    onsave,
  }: {
    open: boolean;
    title: string;
    unitName: string;
    decimals: Decimals;
    value: number;
    onsave: (scaled: number) => void;
  } = $props();

  let text = $state('');
  let error = $state('');

  $effect(() => {
    if (open) {
      text = value ? formatAmount(value, decimals, undefined, { fixed: true }).replaceAll(',', '') : '';
      error = '';
    }
  });

  function save() {
    if (text.trim() === '' || text.trim() === '0') {
      onsave(0);
      open = false;
      return;
    }
    const scaled = parseAmount(text, decimals);
    if (scaled === null) {
      error = `Enter an amount in ${unitName} greater than 0 (up to ${decimals} decimals).`;
      return;
    }
    onsave(scaled);
    open = false;
  }
</script>

<Sheet bind:open {title}>
  <div class="field">
    <label for="amount-input">Amount</label>
    <div class="amount">
      <!-- svelte-ignore a11y_autofocus -->
      <input
        id="amount-input"
        class="input"
        inputmode="decimal"
        autocomplete="off"
        bind:value={text}
        autofocus
        onkeydown={(e) => e.key === 'Enter' && save()}
      />
      <span>{unitName}</span>
    </div>
    {#if error}<p class="error">{error}</p>{/if}
  </div>
  {#snippet footer()}
    <button type="button" class="btn btn-primary btn-block" onclick={save}>Done</button>
  {/snippet}
</Sheet>

<style>
  .amount {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .amount span {
    font-weight: 600;
    color: var(--muted);
  }
  .input {
    font-size: 22px;
    font-weight: 700;
  }
</style>
