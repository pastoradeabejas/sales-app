<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';

  // Bottom sheet on a native <dialog>: focus trap, Esc and backdrop close.
  let {
    open = $bindable(false),
    title,
    children,
    footer,
    onclose,
  }: { open: boolean; title: string; children: Snippet; footer?: Snippet; onclose?: () => void } = $props();

  let dialog: HTMLDialogElement;

  $effect(() => {
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  });

  function closed() {
    open = false;
    onclose?.();
  }
</script>

<dialog
  bind:this={dialog}
  onclose={closed}
  onclick={(e) => e.target === dialog && dialog.close()}
  aria-label={title}
>
  <div class="sheet">
    <header>
      <h2>{title}</h2>
      <button type="button" class="close" aria-label="Close" onclick={() => dialog.close()}><Icon name="close" /></button>
    </header>
    <div class="body">{@render children()}</div>
    {#if footer}<footer>{@render footer()}</footer>{/if}
  </div>
</dialog>

<style>
  dialog {
    width: 100%;
    max-width: 560px;
    max-height: 92dvh;
    margin: auto auto 0;
    padding: 0;
    border: 0;
    border-radius: var(--radius-hero) var(--radius-hero) 0 0;
    background: var(--surface);
    color: var(--ink);
  }
  dialog::backdrop {
    background: rgb(0 0 0 / 0.45);
  }
  .sheet {
    display: flex;
    flex-direction: column;
    max-height: 92dvh;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 8px 4px 20px;
  }
  h2 {
    margin: 0;
  }
  .close {
    width: var(--tap);
    height: var(--tap);
    border: 0;
    background: none;
    color: var(--muted);
  }
  .body {
    overflow-y: auto;
    padding: 8px 20px 16px;
    display: grid;
    gap: 14px;
  }
  footer {
    display: grid;
    gap: 8px;
    padding: 12px 20px calc(16px + env(safe-area-inset-bottom));
    border-top: 1px solid var(--border);
  }
  @media (min-width: 900px) {
    dialog {
      margin: auto;
      border-radius: var(--radius-hero);
    }
  }
</style>
