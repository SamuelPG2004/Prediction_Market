import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import os from 'os';
import path from 'path';
import {defineConfig} from 'vite';
import vercelConfig from './vercel.json';

export default defineConfig(({command, isPreview}) => {
  const dev = command === 'serve' && isPreview !== true;
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
      proxy: apiProxy,
      headers: securityHeaders(dev),
    },
    preview: {
      proxy: apiProxy,
      headers: securityHeaders(),
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

/**
 * Los endpoints serverless propios (bot tipster y su chat) solo existen en
 * Vercel: en dev se reenvían al despliegue de producción para que la sección
 * del bot también funcione en local. Las claves (Gemini) viven allí, así que
 * en local no hace falta configurar nada — a cambio, el chat en dev consume
 * el mismo cupo diario que producción.
 */
const apiProxy = {
  ...limitlessProxy,
  '/api/tipster-bot': {
    target: 'https://prediction-market-phi-rust.vercel.app',
    changeOrigin: true,
  },
  '/api/tipster-chat': {
    target: 'https://prediction-market-phi-rust.vercel.app',
    changeOrigin: true,
  },
};

/**
 * Cabeceras de seguridad con `vercel.json` como ÚNICA fuente de verdad: lo que
 * sirve el deploy es exactamente lo que se sirve aquí, así que una violación
 * del CSP aparece en la consola durante `npm run preview` en vez de descubrirse
 * en producción. El CSP se toca en vercel.json y en ningún otro sitio.
 *
 * En dev hacen falta dos concesiones que Vercel no necesita: el preámbulo de
 * React Refresh es un <script> inline y el HMR abre un WebSocket a localhost.
 * Por eso la comprobación de verdad del CSP es
 * `npm run build && npm run preview`, no `npm run dev`.
 *
 * MANTENIMIENTO: el único punto del CSP que no controlamos es `connect-src`
 * del widget de LI.FI, que saca su lista de RPCs de li.quest EN RUNTIME (no
 * está en el bundle) y puede cambiar sin avisar. Al subir @lifi/widget, abrir
 * el modal de bridge en `npm run preview` y mirar la consola: un
 * "Refused to connect" ahí significa host nuevo que añadir a vercel.json.
 */
function securityHeaders(dev = false): Record<string, string> {
  const headers: Record<string, string> = {};
  const rule = vercelConfig.headers.find((h) => h.source === '/(.*)');
  for (const {key, value} of rule?.headers ?? []) headers[key] = value;

  const csp = headers['Content-Security-Policy'];
  if (dev && csp !== undefined) {
    headers['Content-Security-Policy'] = csp
      .replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
      .replace("connect-src 'self'", "connect-src 'self' ws: http://localhost:*");
  }
  return headers;
}
