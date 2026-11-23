<script lang="ts">
  import Header from '../components/Header.svelte';
  import Icon from '../components/Icon.svelte';

  let { title, point, back, gear = false }: { title: string; point: string; back?: string; gear?: boolean } =
    $props();
</script>

<Header {title} {back}>
  {#snippet actions()}
    {#if gear}
      <a class="icon-btn" href="#/settings" aria-label="Settings"><Icon name="settings" /></a>
    {/if}
  {/snippet}
</Header>

<section class="card">
  <p class="muted">Coming in {point}.</p>
</section>

<style>
  section {
    margin: 0 16px;
  }
  p {
    margin: 0;
  }
</style>
