<script lang="ts">
  import Header from '../../components/Header.svelte';

  let {}: { params?: Record<string, string>; query?: Record<string, string> } = $props();
</script>

<Header title="New purchase" back="#/purchases" />
<div class="page">
  <p class="muted">Coming soon</p>
</div>
