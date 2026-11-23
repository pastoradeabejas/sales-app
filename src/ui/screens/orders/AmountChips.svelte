<script lang="ts">
  import Icon from '../../components/Icon.svelte';
  import type { Cents } from '../../../core/types.ts';
  import { quickChips, stepAmount } from './polish.ts';

  // Quick amounts under an amount input: Owed, €10/20/50 and −/+ €1 steppers.
  let { owed, amount, onset }: { owed: Cents; amount: Cents | null; onset: (cents: Cents) => void } = $props();
</script>

<div class="chips">
  <button type="button" class="step" aria-label="Decrease by €1" onclick={() => onset(stepAmount(amount, -100))}>
    <Icon name="minus" />
  </button>
  {#each quickChips(owed) as c (c.label)}
    <button type="button" class="chip" class:on={amount === c.cents} onclick={() => onset(c.cents)}>{c.label}</button>
  {/each}
  <button type="button" class="step" aria-label="Increase by €1" onclick={() => onset(stepAmount(amount, 100))}>
    <Icon name="plus" />
  </button>
</div>

<style>
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 8px;
  }
  .chip,
  .step {
    display: inline-grid;
    place-items: center;
    min-height: var(--tap);
    min-width: var(--tap);
    padding: 0 14px;
    border: 1px solid var(--border, currentColor);
    border-radius: 999px;
    background: var(--surface, transparent);
    color: var(--ink);
    font-weight: 600;
    font-size: var(--fs-small);
  }
  .step {
    padding: 0;
  }
  .chip.on {
    border-color: var(--accent);
    color: var(--accent);
  }
</style>
