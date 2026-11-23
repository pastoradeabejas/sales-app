<script lang="ts">
  import { formatMoney } from '../../../core/money.ts';
  import { formatAmount } from '../../../core/quantity.ts';
  import { autoBucket, timeSeries } from '../../../core/stats.ts';
  import type { Decimals } from '../../../core/types.ts';
  import type { ClassSold, Range } from '../../../core/stats.ts';
  import LineChart from '../../charts/LineChart.svelte';
  import StackedBars from '../../charts/StackedBars.svelte';
  import type { ChartPoint } from '../../charts/geometry.ts';
  import Segmented from '../../components/Segmented.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import { app, view } from '../../data.svelte.ts';
  import { bucketLabel, seriesMetric } from './logic.ts';

  let { open = $bindable(false), cls, range }: { open: boolean; cls: ClassSold | null; range: Range } = $props();

  let kind = $state<'bars' | 'line'>('bars');
  let selected = $state<number | null>(null);

  const bucket = $derived(autoBucket(range));
  const metric = $derived(cls ? seriesMetric(cls) : 'units');
  const raw = $derived(cls ? timeSeries(app.orders, app.payments, view.balances, range, metric, { classId: cls.classId }, bucket) : []);
  // Amounts are scaled integers; charts show base units.
  const factor = $derived(metric === 'amount' && cls ? 10 ** cls.decimals : 1);
  const points = $derived<ChartPoint[]>(
    raw.map((p) => ({ key: p.start, label: bucketLabel(p.start, bucket), paid: p.paid / factor, unpaid: p.unpaid / factor, total: p.total / factor })),
  );
  const unit = $derived(cls?.unitName ?? '');
  const format = (v: number) => `${Number(v.toFixed(3))}${unit ? ' ' + unit : ''}`;
  const orders = $derived(selected === null ? [] : (raw[selected]?.orderIds ?? []).flatMap((id) => view.ordersById.get(id) ?? []));

  $effect(() => {
    void cls;
    void range;
    selected = null;
  });
</script>

<Sheet bind:open title={cls ? `${cls.className} sold` : 'Sold'}>
  {#if cls}
    <Segmented
      label="Chart type"
      options={[{ value: 'bars', label: 'Bars' }, { value: 'line', label: 'Line' }]}
      bind:value={kind}
    />
    {#if kind === 'bars'}
      <StackedBars {points} label="{cls.className} {metric === 'units' ? 'items' : 'amount'} sold" {format} {selected} onselect={(i) => (selected = i)} />
    {:else}
      <LineChart {points} label="{cls.className} {metric === 'units' ? 'items' : 'amount'} sold" {format} {selected} onselect={(i) => (selected = i)} />
    {/if}
    {#if selected !== null}
      <div class="list">
        {#each orders as o (o.id)}
          <a class="list-row" href="#/orders/{o.id}">
            <span class="grow"><span class="title">{o.clientName}</span><span class="muted">{o.date}</span></span>
            <span class="amount">{formatMoney(o.total)}</span>
          </a>
        {:else}
          <p class="muted">No orders in this period.</p>
        {/each}
      </div>
    {/if}
    <p class="muted">Total in range: {formatAmount(cls.amount, cls.decimals as Decimals, cls.unitName)}</p>
  {/if}
</Sheet>

