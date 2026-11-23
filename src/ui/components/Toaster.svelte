<script lang="ts">
  import { dismissToast, toasts } from '../toast.svelte.ts';

  async function act() {
    const action = toasts.current?.action;
    dismissToast();
    await action?.run();
  }
</script>

<div class="region" role="status" aria-live="polite">
  {#if toasts.current}
    <div class="toast">
      <span>{toasts.current.message}</span>
      {#if toasts.current.action}
        <button type="button" onclick={act}>{toasts.current.action.label}</button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .region {
    position: fixed;
    left: 12px;
    right: 12px;
    bottom: calc(var(--nav-h) + 84px + env(safe-area-inset-bottom));
    z-index: 20;
    display: flex;
    justify-content: center;
    pointer-events: none;
  }
  .toast {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 12px;
    max-width: 560px;
    width: 100%;
    padding: 6px 6px 6px 16px;
    min-height: 52px;
    border-radius: var(--radius-control);
    background: var(--ink);
    color: var(--bg);
    box-shadow: 0 6px 20px rgb(0 0 0 / 0.25);
  }
  span {
    flex: 1;
  }
  button {
    min-height: var(--tap);
    padding: 0 14px;
    border: 0;
    border-radius: 9px;
    background: transparent;
    color: var(--accent-soft);
    font-weight: 700;
  }
</style>
