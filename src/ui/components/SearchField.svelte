<script lang="ts">
  import Icon from './Icon.svelte';
  let { value = $bindable(''), label, placeholder = '' }: { value: string; label: string; placeholder?: string } = $props();
  const id = `search-${Math.random().toString(36).slice(2)}`;
</script>

<div class="search">
  <Icon name="search" size={18} />
  <label for={id} class="visually-hidden">{label}</label>
  <input {id} type="search" bind:value {placeholder} autocomplete="off" />
</div>

<style>
  .search {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 46px;
    padding: 0 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--surface);
    color: var(--muted);
  }
  input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--ink);
    font: inherit;
    font-size: 16px;
  }
  .search:focus-within {
    outline: 2px solid var(--accent);
  }
</style>
