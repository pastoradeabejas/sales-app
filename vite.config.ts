import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };
import { config } from './src/config.ts';
import { buildManifest, normalizeBase } from './src/manifest.ts';

const base = normalizeBase(process.env.VITE_BASE);

export default defineConfig({
  base,
  plugins: [
    svelte(),
    {
      name: 'app-identity',
      transformIndexHtml: (html) =>
        html.replaceAll('{{APP_NAME}}', config.appName).replaceAll('{{THEME_COLOR}}', config.themeColor),
    },
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      manifest: buildManifest(config, base),
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        cleanupOutdatedCaches: true,
        runtimeCaching: [], // the GitHub API is never cached (spec §7)
      },
    }),
  ],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
    'import.meta.env.VITE_COMMIT': JSON.stringify(process.env.VITE_COMMIT ?? 'dev'),
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
