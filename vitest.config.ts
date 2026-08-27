import os from 'os';
import path from 'path';
import {defineConfig} from 'vitest/config';

// Config propia (no reutiliza vite.config.ts) para que los tests no carguen
// los plugins de React/Tailwind, que aquí no pintan nada.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Misma trampa de OneDrive que en vite.config.ts: la caché fuera del árbol.
  cacheDir: path.join(os.tmpdir(), 'vitest-aether-markets'),
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
