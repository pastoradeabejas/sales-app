<script lang="ts">
  import Placeholder from '../Placeholder.svelte';
  let { params = {}, query = {} }: { params?: Record<string, string>; query?: Record<string, string> } = $props();
  void params;
  void query;
</script>

<Placeholder title="Product" point="S4" back="#/products" gear={false} />
