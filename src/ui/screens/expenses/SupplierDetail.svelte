<script lang="ts">
  import Header from '../../components/Header.svelte';

  let {}: { params?: Record<string, string>; query?: Record<string, string> } = $props();
</script>

<Header title="Supplier" back="#/suppliers" />
<div class="page">
  <p class="muted">Coming soon</p>
</div>
