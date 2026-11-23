<script lang="ts">
  import ConfirmSheet from '../../components/ConfirmSheet.svelte';
  import { formatMoney } from '../../../core/money.ts';
  import type { Cents, Id } from '../../../core/types.ts';
  import { voidOrder } from '../../data.svelte.ts';
  import { showToast } from '../../toast.svelte.ts';

  // Void an order with a reason; its linked payments are voided too (D-006).
  let { open = $bindable(false), orderId, linked }: { open: boolean; orderId: Id; linked: Cents } = $props();

  let reason = $state('');

  $effect(() => {
    if (open) reason = '';
  });

  async function confirm() {
    await voidOrder(orderId, reason.trim());
    showToast('Order voided');
  }
</script>

<ConfirmSheet bind:open title="Void order" confirmLabel="Void order" danger disabled={!reason.trim()} onconfirm={confirm}>
  <div class="form">
    {#if linked > 0}
      <p class="warning">This order has {formatMoney(linked)} in payments. Voiding it will also void them.</p>
    {/if}
    <div class="field">
      <label for="void-reason">Reason</label>
      <input id="void-reason" class="input" bind:value={reason} placeholder="e.g. entered twice" autocomplete="off" />
    </div>
    <p class="hint">A voided order stays in the history but no longer counts in totals, stock or stats.</p>
  </div>
</ConfirmSheet>

<style>
  .form {
    display: grid;
    gap: 14px;
    padding-bottom: 8px;
  }
</style>
