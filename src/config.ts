// App identity: the ONE place for name, colours and description.
// The PWA manifest (src/manifest.ts) and the icons script read it.
export const config = {
  appName: 'Sales Book',
  shortName: 'Sales',
  description: 'Offline-first bookkeeping for sales, clients, payments and stock.',
  themeColor: '#2457C5',
  backgroundColor: '#F4F5F7',
} as const;

export type AppConfig = typeof config;
