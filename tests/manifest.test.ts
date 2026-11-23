import { describe, expect, it } from 'vitest';
import { config } from '../src/config.ts';
import { buildManifest } from '../src/manifest.ts';

describe('buildManifest', () => {
  it.each(['/', '/sales-app/'])('is relative to base %s', (base) => {
    const m = buildManifest(config, base);
    expect(m.id).toBe(base);
    expect(m.start_url).toBe(base);
    expect(m.scope).toBe(base);
    expect(m.shortcuts).toEqual([
      { name: 'New order', short_name: 'New order', url: `${base}#/orders/new`, icons: [m.icons[0]] },
    ]);
    for (const icon of m.icons) expect(icon.src.startsWith(`${base}icons/`)).toBe(true);
  });

  it('takes identity and colours from config (spec §7)', () => {
    const m = buildManifest(config, '/');
    expect(m).toMatchObject({
      name: 'Sales Book',
      short_name: 'Sales',
      description: config.description,
      display: 'standalone',
      orientation: 'portrait',
      theme_color: '#2457C5',
      background_color: '#F4F5F7',
    });
  });

  it('has 192, 512 and a maskable 512 icon', () => {
    expect(buildManifest(config, '/').icons).toEqual([
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ]);
  });
});
