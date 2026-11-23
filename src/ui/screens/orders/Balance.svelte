<script lang="ts">
  import { formatMoney } from '../../../core/money.ts';
  import type { Id } from '../../../core/types.ts';
  import { view } from '../../data.svelte.ts';

  // "owes €145.00" or "Credit €20.00" next to a client; nothing when settled.
  let { clientId }: { clientId: Id } = $props();
  const b = $derived(view.balances.get(clientId));
</script>

{#if b && b.owed > 0}
  <span class="bal owed-text">owes {formatMoney(b.owed)}</span>
{:else if b && b.credit > 0}
  <span class="bal credit-text">Credit {formatMoney(b.credit)}</span>
{/if}

<style>
  .bal {
    font-size: var(--fs-small);
    font-weight: 600;
    white-space: nowrap;
  }
</style>
