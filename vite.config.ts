import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import os from 'os';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    // Este proyecto vive dentro de OneDrive, que mantiene handles abiertos sobre
    // node_modules y hace fallar al optimizador de dependencias con
    // "EPERM: operation not permitted, rmdir .vite/deps". Sacar la caché del
    // árbol sincronizado lo evita.
    cacheDir: path.join(os.tmpdir(), 'vite-aether-markets'),
    server: {
      // HMR se desactiva en AI Studio via DISABLE_HMR.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
