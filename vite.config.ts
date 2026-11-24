import { defineConfig } from 'vitest/config';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  define: { __CARD_VERSION__: JSON.stringify(pkg.version) },
  build: {
    lib: {
      entry: 'src/heating-room-card.ts',
      formats: ['es'],
      fileName: () => 'heating-room-card.js',
    },
    rollupOptions: { external: [] },
  },
  test: { environment: 'happy-dom' },
});
