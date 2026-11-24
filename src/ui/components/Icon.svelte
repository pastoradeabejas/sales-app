<script lang="ts" module>
  // Inline stroke icons (spec §10: no emoji). Shapes follow the mockups.
  const paths = {
    overview: ['M3 12h4l3-8 4 16 3-8h4'],
    orders: ['M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', 'M9 8h6M9 12h6M9 16h4'],
    clients: ['M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8z', 'M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6'],
    stock: ['M12 3 3 8l9 5 9-5z', 'M3 12.5l9 5 9-5', 'M3 17l9 5 9-5'],
    products: ['M3 12V3h9l9 9-9 9z', 'M7.5 6a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z'],
    settings: [
      'M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z',
      'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
    ],
    plus: ['M12 5v14M5 12h14'],
    minus: ['M5 12h14'],
    back: ['M15 18l-6-6 6-6'],
    chevron: ['M9 6l6 6-6 6'],
    down: ['M6 9l6 6 6-6'],
    up: ['M18 15l-6-6-6 6'],
    search: ['M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14z', 'm20 20-3.5-3.5'],
    check: ['M20 6 9 17l-5-5'],
    close: ['M6 6l12 12M18 6 6 18'],
    more: ['M12 5h.01M12 12h.01M12 19h.01'],
    table: ['M3 5h18', 'M3 9h18', 'M3 19h18', 'M7 12.5h10M7 15.5h10'],
    cards: ['M5 4h14a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z', 'M5 13h14a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1z'],
    edit: ['M4 20h4L19 9l-4-4L4 16z', 'M13 7l4 4'],
    archive: ['M3 5h18v4H3z', 'M5 9v10h14V9', 'M10 13h4'],
    transform: ['M4 7h12l-3-3M20 17H8l3 3'],
    cloud: ['M7 18a4 4 0 0 1-.6-8 6 6 0 0 1 11.4 1.5A3.5 3.5 0 0 1 17.5 18z'],
    offline: ['M7 18a4 4 0 0 1-.6-8 6 6 0 0 1 11.4 1.5A3.5 3.5 0 0 1 17.5 18z', 'M3 3l18 18'],
    alert: ['M12 3 2 20h20z', 'M12 10v4M12 17h.01'],
    download: ['M12 4v12M7 11l5 5 5-5', 'M5 20h14'],
    upload: ['M12 20V8M7 13l5-5 5 5', 'M5 4h14'],
  };
  export type IconName = keyof typeof paths;
</script>

<script lang="ts">
  let { name, size = 22 }: { name: IconName; size?: number } = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  {#each paths[name] as d (d)}<path {d} />{/each}
</svg>
