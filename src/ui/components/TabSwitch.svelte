<script lang="ts">
  // Two-sided tab switch at the top of list screens: Orders/Clients, Purchases/Suppliers, Stock/Products.
  import Segmented from './Segmented.svelte';
  import { go, rememberSide } from '../router.svelte.ts';
  import { SIDES, tabOf, type RouteName } from '../router.ts';

  let { side }: { side: 'orders' | 'clients' | 'purchases' | 'suppliers' | 'stock' | 'recipes' } = $props();

  const labels: Record<string, string> = {
    orders: 'Orders',
    clients: 'Clients',
    purchases: 'Purchases',
    suppliers: 'Suppliers',
    stock: 'Stock',
    recipes: 'Recipes',
  };
  const tab = $derived(tabOf(side as RouteName));
  const options = $derived(SIDES[tab].map((s) => ({ value: s, label: labels[s] })));
  let value = $derived(side as string);

  $effect(() => rememberSide(tab, side));
</script>

<div class="tab-switch">
  <Segmented label="Section" {options} bind:value onchange={(s) => go(`#/${s}`)} />
</div>

<style>
  .tab-switch {
    padding: 4px 16px 12px;
  }
</style>
