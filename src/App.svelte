<script lang="ts">
  import BottomNav from './ui/components/BottomNav.svelte';
  import UpdateBanner from './ui/components/UpdateBanner.svelte';
  import Fab from './ui/components/Fab.svelte';
  import Placeholder from './ui/screens/Placeholder.svelte';
  import Settings from './ui/screens/Settings.svelte';
  import { router } from './ui/router.svelte.ts';
  import { tabOf, type RouteName } from './ui/router.ts';

  // Screens not built yet: title, STRATEGY point, back target (sub-screens).
  const placeholders: Record<Exclude<RouteName, 'settings'>, [string, string, string?]> = {
    overview: ['Overview', 'S9'],
    orders: ['Orders', 'S6'],
    'order-new': ['New order', 'S6', '#/orders'],
    order: ['Order', 'S6', '#/orders'],
    'order-edit': ['Edit order', 'S6', '#/orders'],
    clients: ['Clients', 'S5'],
    client: ['Client', 'S5', '#/clients'],
    stock: ['Stock', 'S8'],
    'stock-add': ['Add stock', 'S8', '#/stock'],
    'stock-remove': ['Remove stock', 'S8', '#/stock'],
    'stock-transform': ['Transform', 'S8', '#/stock'],
    'stock-class': ['Stock', 'S8', '#/stock'],
    products: ['Products', 'S4'],
    product: ['Product', 'S4', '#/products'],
  };

  const name = $derived(router.route.name);
  const fab = $derived(name === 'overview' || name === 'orders');
</script>

<main class:with-fab={fab}>
  {#if name === 'settings'}
    <Settings />
  {:else}
    {@const [title, point, back] = placeholders[name]}
    {#key name}
      <Placeholder {title} {point} {back} gear={name === 'overview'} />
    {/key}
  {/if}
</main>

{#if fab}<Fab />{/if}
<BottomNav active={tabOf(name)} />
<UpdateBanner />

<style>
  main {
    padding-bottom: calc(var(--nav-h) + 24px + env(safe-area-inset-bottom));
  }
  main.with-fab {
    padding-bottom: calc(var(--nav-h) + 92px + env(safe-area-inset-bottom));
  }
</style>
