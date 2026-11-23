<script lang="ts">
  import AmountChips from './AmountChips.svelte';
  import Segmented from '../../components/Segmented.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import { formatMoney, parseMoney } from '../../../core/money.ts';
  import { isFutureDate } from '../../../core/orders.ts';
  import type { Cents, Order, PaymentMethod } from '../../../core/types.ts';
  import { addPayment, app, localDate, newPayment } from '../../data.svelte.ts';
  import { showToast } from '../../toast.svelte.ts';

  // "Add payment" on an order (§8.5): amount prefilled with what's owed, linked to this order.
  let { open = $bindable(false), order, owed }: { open: boolean; order: Order; owed: Cents } = $props();

  let text = $state('');
  let method = $state<PaymentMethod>('cash');
  let date = $state(localDate());
  let error = $state('');
  let busy = $state(false);

  const amount = $derived(parseMoney(text));
  const methods: { value: PaymentMethod; label: string }[] = [
    { value: 'cash', label: 'Cash' },
    { value: 'bizum', label: 'Bizum' },
    { value: 'other', label: 'Other' },
  ];

  $effect(() => {
    if (open) {
      text = owed > 0 ? (owed / 100).toFixed(2) : '';
      method = app.settings.lastPaymentMethod ?? 'cash';
      date = localDate();
      error = '';
    }
  });

  async function save() {
    if (!amount || amount <= 0) {
      error = 'Enter an amount above €0';
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      error = 'Choose a date';
      return;
    }
    busy = true;
    try {
      await addPayment(newPayment({ clientId: order.clientId, orderId: order.id, amount, method, date }));
      open = false;
      showToast(`Payment ${formatMoney(amount)} added`);
    } finally {
      busy = false;
    }
  }
</script>

<Sheet bind:open title="Add payment">
  <div class="form">
    <div class="field">
      <label for="pay-amount">Amount €</label>
      <input id="pay-amount" class="input" inputmode="decimal" autocomplete="off" bind:value={text} placeholder="0.00" />
      <AmountChips {owed} amount={amount ?? null} onset={(c) => (text = (c / 100).toFixed(2))} />
      {#if amount && amount > owed}
        <p class="hint credit-text">{formatMoney(amount - owed)} will be kept as credit</p>
      {/if}
      {#if error}<p class="error">{error}</p>{/if}
    </div>
    <Segmented options={methods} bind:value={method} label="Payment method" />
    <div class="field">
      <label for="pay-date">Date</label>
      <input id="pay-date" class="input" type="date" bind:value={date} />
      {#if isFutureDate(date, localDate())}<p class="warning">This date is in the future.</p>{/if}
    </div>
  </div>
  {#snippet footer()}
    <button type="button" class="btn btn-primary btn-block" disabled={busy} onclick={save}>Add payment</button>
  {/snippet}
</Sheet>

<style>
  .form {
    display: grid;
    gap: 14px;
  }
</style>
