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
      proxy: limitlessProxy,
    },
    preview: {
      proxy: limitlessProxy,
    },
  };
});

/**
 * La API de Limitless tiene allowlist de CORS (solo responde con
 * Access-Control-Allow-Origin a sus propios dominios), así que el navegador
 * no puede llamarla directamente desde este origen. El adaptador pide a
 * `/api/limitless/...` (same-origin) y este proxy reenvía. En producción, el
 * host que sirva la app necesita un reverse proxy equivalente.
 */
const limitlessProxy = {
  '/api/limitless': {
    target: 'https://api.limitless.exchange',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api\/limitless/, ''),
  },
};
