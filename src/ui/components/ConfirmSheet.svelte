<script lang="ts">
  import type { Snippet } from 'svelte';
  import Sheet from './Sheet.svelte';

  // Confirmation for archive / void / merge / disconnect.
  let {
    open = $bindable(false),
    title,
    confirmLabel,
    danger = false,
    disabled = false,
    onconfirm,
    children,
  }: {
    open: boolean;
    title: string;
    confirmLabel: string;
    danger?: boolean;
    disabled?: boolean;
    onconfirm: () => void | Promise<void>;
    children: Snippet;
  } = $props();

  let busy = $state(false);

  async function confirm() {
    busy = true;
    try {
      await onconfirm();
      open = false;
    } finally {
      busy = false;
    }
  }
</script>

<Sheet bind:open {title}>
  {@render children()}
  {#snippet footer()}
    <button type="button" class="btn btn-block {danger ? 'btn-danger' : 'btn-primary'}" disabled={busy || disabled} onclick={confirm}>
      {confirmLabel}
    </button>
    <button type="button" class="btn btn-block btn-ghost" onclick={() => (open = false)}>Cancel</button>
  {/snippet}
</Sheet>
