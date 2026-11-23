<script lang="ts">
  import { formatMoney, parseMoney } from '../../../core/money.ts';
  import { previewReceive } from '../../../core/payments.ts';
  import type { Client, PaymentMethod } from '../../../core/types.ts';
  import { addPayment, app, localDate, newPayment, view } from '../../data.svelte.ts';
  import Segmented from '../../components/Segmented.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import AmountChips from '../orders/AmountChips.svelte';
  import { receiveDefaults, shortDate } from './logic.ts';

  // Receive payment (unlinked, orderId null). Also used for "Mark all paid" via `fixed`.
  let { open = $bindable(false), client, fixed = false }: { open: boolean; client: Client; fixed?: boolean } = $props();

  const balance = $derived(view.balances.get(client.id));
  const owed = $derived(balance?.owed ?? 0);
  let text = $state('');
  let method = $state<PaymentMethod>('cash');
  let date = $state(localDate());
  let note = $state('');

  $effect(() => {
    if (open) {
      const d = receiveDefaults(owed, app.settings.lastPaymentMethod, localDate());
      text = (d.amount / 100).toFixed(2);
      method = d.method;
      date = d.date;
      note = '';
    }
  });

  const amount = $derived(parseMoney(text) ?? 0);
  const preview = $derived(
    balance && amount > 0
      ? previewReceive(balance, app.orders.filter((o) => o.clientId === client.id && !o.voided), amount)
      : null,
  );
  const orderDate = (id: string) => view.ordersById.get(id)?.date ?? '';

  async function save() {
    if (amount <= 0) return;
    await addPayment(newPayment({ clientId: client.id, orderId: null, amount, method, date, note: note.trim() }));
    open = false;
  }
</script>

<Sheet bind:open title={fixed ? 'Mark all paid' : 'Receive payment'}>
  <div class="field">
    <label for="rs-amount">Amount received (€)</label>
    <input id="rs-amount" class="input" inputmode="decimal" bind:value={text} readonly={fixed} />
    {#if !fixed}<AmountChips {owed} amount={amount > 0 ? amount : null} onset={(c) => (text = (c / 100).toFixed(2))} />{/if}
    {#if owed > 0 && !fixed}<p class="hint">{client.name} owes {formatMoney(owed)}. You can enter more.</p>{/if}
  </div>
  <div class="field">
    <span class="label">Method</span>
    <Segmented
      label="Method"
      bind:value={method}
      options={[
        { value: 'cash', label: 'Cash' },
        { value: 'bizum', label: 'Bizum' },
        { value: 'other', label: 'Other' },
      ]}
    />
  </div>
  <div class="field">
    <label for="rs-date">Date</label>
    <input id="rs-date" class="input" type="date" bind:value={date} />
  </div>
  <div class="field">
    <label for="rs-note">Note (optional)</label>
    <input id="rs-note" class="input" bind:value={note} />
  </div>
  {#if preview}
    <div class="card">
      <h2>Applied to (oldest first)</h2>
      {#each preview.covers as c (c.orderId)}
        <div class="row-between">
          <span>Order {shortDate(orderDate(c.orderId))}</span>
          <span>{formatMoney(c.amount)} {c.closes ? '· closes it' : '· partial'}</span>
        </div>
      {/each}
      {#if preview.toCredit > 0}<p class="credit-text">{formatMoney(preview.toCredit)} will be kept as credit</p>{/if}
    </div>
  {/if}
  {#snippet footer()}
    <button type="button" class="btn btn-primary btn-block" disabled={amount <= 0} onclick={save}>
      {amount > 0 ? `Save ${formatMoney(amount)}` : 'Enter an amount'}
    </button>
  {/snippet}
</Sheet>
