// Pure build helpers: base path and web app manifest (spec §7).

/** Normalises a Vite base path to "/" or "/name/". */
export function normalizeBase(raw: string | undefined): string {
  const parts = (raw ?? '').split('/').map((p) => p.trim()).filter(Boolean);
  return parts.length ? `/${parts.join('/')}/` : '/';
}

type Icon = { src: string; sizes: string; type: string; purpose?: 'maskable' };

/** Web app manifest built from the identity in src/config.ts. */
export function buildManifest(
  app: { appName: string; shortName: string; description: string; themeColor: string; backgroundColor: string },
  base: string,
) {
  const icons: Icon[] = [
    { src: `${base}icons/icon-192.png`, sizes: '192x192', type: 'image/png' },
    { src: `${base}icons/icon-512.png`, sizes: '512x512', type: 'image/png' },
    { src: `${base}icons/maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ];
  return {
    id: base,
    name: app.appName,
    short_name: app.shortName,
    description: app.description,
    start_url: base,
    scope: base,
    display: 'standalone' as const,
    orientation: 'portrait' as const,
    theme_color: app.themeColor,
    background_color: app.backgroundColor,
    icons,
    shortcuts: [{ name: 'New order', short_name: 'New order', url: `${base}#/orders/new`, icons: [icons[0]] }],
  };
}
