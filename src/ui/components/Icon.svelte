<script lang="ts" module>
  const paths = {
    overview: ['M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'],
    orders: ['M6 3h12v18l-3-2-3 2-3-2-3 2z', 'M9 8h6M9 12h6'],
    clients: ['M9 4.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z', 'M2.5 20a6.5 6.5 0 0 1 13 0', 'M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5'],
    stock: ['M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z', 'M3 7.5 12 12l9-4.5M12 12v9'],
    products: ['M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z', 'M7.5 6a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z'],
    settings: ['M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12', 'M16 4a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM10 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM18 16a2 2 0 1 1 0 4 2 2 0 0 1 0-4z'],
    plus: ['M12 5v14M5 12h14'],
    back: ['M15 5l-7 7 7 7'],
  };
  export type IconName = keyof typeof paths;
</script>

<script lang="ts">
  let { name, size = 24 }: { name: IconName; size?: number } = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.8"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  {#each paths[name] as d (d)}<path {d} />{/each}
</svg>
