import { defineConfig } from 'vitest/config';

export default defineConfig({
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
