import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import pkg from './package.json' with { type: 'json' };
import { normalizeBase } from './src/manifest.ts';

const base = normalizeBase(process.env.VITE_BASE);

export default defineConfig({
  base,
  plugins: [svelte()],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
    'import.meta.env.VITE_COMMIT': JSON.stringify(process.env.VITE_COMMIT ?? 'dev'),
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
