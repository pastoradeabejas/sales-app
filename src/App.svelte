<script lang="ts">
  import type { Component } from 'svelte';
  import BottomNav from './ui/components/BottomNav.svelte';
  import Fab from './ui/components/Fab.svelte';
  import Toaster from './ui/components/Toaster.svelte';
  import UpdateBanner from './ui/components/UpdateBanner.svelte';
  import { app, initData } from './ui/data.svelte.ts';
  import { router } from './ui/router.svelte.ts';
  import { tabOf, type RouteName } from './ui/router.ts';
  import { isConfigured } from './store/settings.ts';
  import Settings from './ui/screens/Settings.svelte';
  import Overview from './ui/screens/overview/Overview.svelte';
  import Orders from './ui/screens/orders/Orders.svelte';
  import OrderForm from './ui/screens/orders/OrderForm.svelte';
  import OrderDetail from './ui/screens/orders/OrderDetail.svelte';
  import Clients from './ui/screens/clients/Clients.svelte';
  import ClientDetail from './ui/screens/clients/ClientDetail.svelte';
  import Stock from './ui/screens/stock/Stock.svelte';
  import StockMove from './ui/screens/stock/StockMove.svelte';
  import Transform from './ui/screens/stock/Transform.svelte';
  import StockClass from './ui/screens/stock/StockClass.svelte';
  import Products from './ui/screens/products/Products.svelte';
  import ClassDetail from './ui/screens/products/ClassDetail.svelte';

  // Screens take any subset of { params, query }.
  type Screen = Component<any>;

  const screens: Record<RouteName, Screen> = {
    overview: Overview,
    settings: Settings,
    orders: Orders,
    'order-new': OrderForm,
    order: OrderDetail,
    'order-edit': OrderForm,
    clients: Clients,
    client: ClientDetail,
    stock: Stock,
    'stock-add': StockMove,
    'stock-remove': StockMove,
    'stock-transform': Transform,
    'stock-class': StockClass,
    products: Products,
    product: ClassDetail,
  };

  initData().catch((e) => (app.error = `Could not open local data: ${e instanceof Error ? e.message : e}`));

  // First run: Settings until the device is configured (§8.1).
  const name = $derived<RouteName>(app.ready && !isConfigured(app.settings) ? 'settings' : router.route.name);
  const Current = $derived(screens[name]);
  const fab = $derived(name === 'overview' || name === 'orders');
  // Forms have their own sticky footer: no bottom nav there.
  const form = $derived(['order-new', 'order-edit', 'stock-add', 'stock-remove', 'stock-transform'].includes(name));
</script>

{#if app.error}
  <p class="warning app-error" role="alert">{app.error}</p>
{/if}

<main class:with-fab={fab} class:form>
  {#if app.ready}
    {#key `${name}/${JSON.stringify(router.route.params)}`}
      <Current params={{ ...router.route.params, route: name }} query={router.query} />
    {/key}
  {:else if !app.error}
    <p class="muted loading">Loading…</p>
  {/if}
</main>

{#if fab && app.ready}<Fab />{/if}
{#if !form}<BottomNav active={tabOf(name)} />{/if}
<UpdateBanner />
<Toaster />

<style>
  main {
    padding-bottom: calc(var(--nav-h) + 24px + env(safe-area-inset-bottom));
  }
  main.with-fab {
    padding-bottom: calc(var(--nav-h) + 96px + env(safe-area-inset-bottom));
  }
  main.form {
    padding-bottom: 280px;
  }
  .loading {
    padding: 40px 20px;
  }
  .app-error {
    margin: 8px;
  }
</style>
