<script lang="ts">
  import Icon from './Icon.svelte';
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
</style>
