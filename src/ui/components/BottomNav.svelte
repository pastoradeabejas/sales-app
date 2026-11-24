<script lang="ts">
  import Icon from './Icon.svelte';
  import { config } from '../../config.ts';
  import type { Tab } from '../router.ts';

  let { active }: { active: Tab } = $props();

  const tabs: { tab: Tab; label: string }[] = [
    { tab: 'overview', label: 'Overview' },
    { tab: 'orders', label: 'Orders' },
    { tab: 'clients', label: 'Clients' },
    { tab: 'stock', label: 'Stock' },
    { tab: 'products', label: 'Products' },
  ];
</script>

<nav aria-label="Main">
  <span class="brand">
    <img src="{import.meta.env.BASE_URL}favicon.svg" alt="" width="28" height="28" />
    {config.appName}
  </span>
  {#each tabs as { tab, label } (tab)}
    <a href="#/{tab}" aria-current={tab === active ? 'page' : undefined}>
      <Icon name={tab} size={22} />
      <span>{label}</span>
    </a>
  {/each}
</nav>

<style>
  nav {
    position: fixed;
    inset: auto 0 0 0;
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    min-height: var(--nav-h);
    padding-bottom: env(safe-area-inset-bottom);
    background: var(--surface);
    border-top: 1px solid var(--border);
  }
  a {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    min-height: var(--tap);
    color: var(--muted);
    font-size: 11px;
    text-decoration: none;
  }
  a[aria-current='page'] {
    color: var(--accent);
    font-weight: 600;
  }
  .brand {
    display: none;
  }
  /* Mac / wide screens: left sidebar instead of the bottom nav (§8). */
  @media (min-width: 900px) {
    nav {
      inset: 0 auto 0 0;
      width: var(--sidebar-w);
      grid-template-columns: none;
      grid-auto-rows: 52px;
      align-content: start;
      gap: 4px;
      padding: 20px 12px;
      border-top: 0;
      border-right: 1px solid var(--border);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 4px 12px 16px;
      font-size: var(--fs-section);
      font-weight: 700;
    }
    a {
      flex-direction: row;
      justify-content: flex-start;
      gap: 12px;
      padding: 0 12px;
      border-radius: var(--radius-control);
      font-size: var(--fs-body);
    }
    a[aria-current='page'] {
      background: var(--accent-soft);
    }
  }
</style>
