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
  import { startSync, sync } from './ui/sync.svelte.ts';
  import Settings from './ui/screens/Settings.svelte';
  import Overview from './ui/screens/overview/Overview.svelte';
  import Orders from './ui/screens/orders/Orders.svelte';
  import OrderForm from './ui/screens/orders/OrderForm.svelte';
  import OrderDetail from './ui/screens/orders/OrderDetail.svelte';
  import Clients from './ui/screens/clients/Clients.svelte';
  import ClientDetail from './ui/screens/clients/ClientDetail.svelte';
  import Recipes from './ui/screens/stock/Recipes.svelte';
  import StockMove from './ui/screens/stock/StockMove.svelte';
  import Transform from './ui/screens/stock/Transform.svelte';
  import StockClass from './ui/screens/stock/StockClass.svelte';
  import Products from './ui/screens/products/Products.svelte';
  import ClassDetail from './ui/screens/products/ClassDetail.svelte';
  import Purchases from './ui/screens/expenses/Purchases.svelte';
  import PurchaseForm from './ui/screens/expenses/PurchaseForm.svelte';
  import PurchaseDetail from './ui/screens/expenses/PurchaseDetail.svelte';
  import Suppliers from './ui/screens/expenses/Suppliers.svelte';
  import SupplierDetail from './ui/screens/expenses/SupplierDetail.svelte';

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
    stock: Products,
    recipes: Recipes,
    'stock-add': StockMove,
    'stock-remove': StockMove,
    'stock-transform': Transform,
    'stock-class': StockClass,
    products: Products,
    product: ClassDetail,
    purchases: Purchases,
    'purchase-new': PurchaseForm,
    purchase: PurchaseDetail,
    'purchase-edit': PurchaseForm,
    suppliers: Suppliers,
    supplier: SupplierDetail,
  };

  initData()
    .then(startSync)
    .catch((e) => (app.error = `Could not open local data: ${e instanceof Error ? e.message : e}`));

  // First run: Settings until the device is configured (§8.1).
  const name = $derived<RouteName>(app.ready && !isConfigured(app.settings) ? 'settings' : router.route.name);
  const Current = $derived(screens[name]);
  const fab = $derived(name === 'overview' || name === 'orders' || name === 'purchases');
  // Forms have their own sticky footer: no bottom nav there.
  // Mac / wide screens: list and detail side by side on Orders and Clients (§8).
  const wideQuery = matchMedia('(min-width: 900px)');
  let wide = $state(wideQuery.matches);
  wideQuery.addEventListener('change', (e) => (wide = e.matches));
  const splitList = $derived(
    !wide
      ? null
      : name === 'orders' || name === 'order'
        ? 'orders'
        : name === 'clients' || name === 'client'
          ? 'clients'
          : name === 'purchases' || name === 'purchase'
            ? 'purchases'
            : name === 'suppliers' || name === 'supplier'
              ? 'suppliers'
              : null,
  );
  const form = $derived(['order-new', 'order-edit', 'purchase-new', 'purchase-edit', 'stock-add', 'stock-remove', 'stock-transform'].includes(name));
</script>

{#if app.error}
  <p class="warning app-error" role="alert">{app.error}</p>
{/if}

{#if sync.state.authError && name !== 'settings'}
  <p class="warning app-error" role="alert">Token invalid or expired. <a href="#/settings">Open Settings</a></p>
{:else if sync.state.readOnly}
  <p class="warning app-error" role="alert">This data needs a newer app version. Update the app (reload).</p>
{/if}

<main class:with-fab={fab} class:form class:split={splitList}>
  {#if app.ready && splitList}
    {@const List = screens[splitList]}
    <div class="pane list-pane">
      <List params={{ route: splitList }} query={router.query} />
    </div>
    <div class="pane detail-pane">
      {#if name === splitList}
        <p class="muted pick">Select {{ orders: 'an order', clients: 'a client', purchases: 'a purchase', suppliers: 'a supplier' }[splitList]} to see it here.</p>
      {:else}
        {#key `${name}/${JSON.stringify(router.route.params)}`}
          <Current params={{ ...router.route.params, route: name }} query={router.query} />
        {/key}
      {/if}
    </div>
  {:else if app.ready}
    {#key `${name}/${JSON.stringify(router.route.params)}`}
      <Current params={{ ...router.route.params, route: name }} query={router.query} />
    {/key}
  {:else if !app.error}
    <p class="muted loading">Loading…</p>
  {/if}
</main>

{#if fab && app.ready}
  {#if name === 'purchases'}<Fab href="#/purchases/new" label="New purchase" />{:else}<Fab />{/if}
{/if}
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
  main.split {
    display: grid;
    grid-template-columns: minmax(320px, 2fr) minmax(0, 3fr);
    gap: 8px;
    max-width: 1280px;
    align-items: start;
  }
  .pane {
    min-width: 0;
  }
  .detail-pane {
    position: sticky;
    top: 0;
    max-height: 100dvh;
    overflow-y: auto;
    border-left: 1px solid var(--border);
  }
  .pick {
    padding: 80px 24px;
    text-align: center;
  }
  .loading {
    padding: 40px 20px;
  }
  .app-error {
    margin: 8px;
  }
</style>
