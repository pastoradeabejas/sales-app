<script lang="ts">
  import Icon from './Icon.svelte';
</script>

<a href="#/orders/new"><Icon name="plus" size={20} /> New order</a>

<style>
  a {
    position: fixed;
    right: 16px;
    bottom: calc(var(--nav-h) + 16px + env(safe-area-inset-bottom));
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 52px;
    padding: 0 20px;
    border-radius: 999px;
    background: var(--accent);
    color: var(--on-accent);
    font-weight: 600;
    text-decoration: none;
    box-shadow: 0 4px 14px rgb(0 0 0 / 0.2);
  }
</style>
