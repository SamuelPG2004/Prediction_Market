/**
 * Configuración de Limitless. ÚNICO lugar donde se decide red, API y
 * credenciales. El resto del adaptador la recibe ya resuelta.
 *
 * Limitless opera solo en Base mainnet (8453), con USDC como colateral y sin
 * testnet. El colateral concreto llega en el payload de cada mercado.
 */

export const LIMITLESS_CHAIN_ID = 8453 // Base
export const LIMITLESS_API_URL = 'https://api.limitless.exchange'

/**
 * La API de Limitless solo permite CORS a sus propios dominios, así que desde
 * el navegador hay que pasar por un proxy same-origin (configurado en
 * vite.config.ts; en producción, un reverse proxy equivalente). La firma HMAC
 * no se ve afectada: firma la ruta real (`/orders`), que es la que el proxy
 * reenvía al servidor.
 */
export const LIMITLESS_PROXY_PATH = '/api/limitless'

/**
 * Cabecera con la que el navegador marca, en modo `auth: 'proxy'`, qué
 * peticiones necesitan firma HMAC. La función serverless (api/limitless-auth)
 * la consume y firma con sus credenciales antes de reenviar.
 */
export const LIMITLESS_SIGN_HEADER = 'x-limitless-sign'

/**
 * Credenciales de token API con alcance (`trading`): firman cada petición
 * autenticada con HMAC-SHA256. Se derivan en limitless.exchange → API Tokens.
 */
export interface LimitlessAuth {
  tokenId: string
  /** Secreto en base64, tal y como lo entrega Limitless. */
  secret: string
}

export interface LimitlessConfig {
  chainId: typeof LIMITLESS_CHAIN_ID
  apiUrl: string
  /**
   * Sin credenciales el adaptador sigue sirviendo catálogo y cotizaciones
   * (endpoints públicos), pero no puede colocar órdenes ni leer posiciones:
   * `canPlaceBet` y `canReadPositions` quedan en false.
   *
   * `'proxy'`: las credenciales viven en el servidor (función
   * api/limitless-auth.ts, enrutada por los rewrites de vercel.json) y es él
   * quien firma; el navegador solo marca qué peticiones necesitan firma.
   * Así el secreto nunca entra en el bundle.
   */
  auth: LimitlessAuth | 'proxy' | null
  /**
   * El plan de venues asigna los deportes a Azuro; Limitless es la fuente
   * NO deportiva. Por defecto sus mercados con dominio `sport` se omiten
   * para no duplicar catálogo. Ponlo a true para listarlos también.
   */
  includeSports: boolean
}

export function makeLimitlessConfig(options?: {
  auth?: LimitlessAuth | 'proxy' | null
  includeSports?: boolean
  apiUrl?: string
}): LimitlessConfig {
  return {
    chainId: LIMITLESS_CHAIN_ID,
    apiUrl: options?.apiUrl ?? LIMITLESS_API_URL,
    auth: options?.auth ?? null,
    includeSports: options?.includeSports ?? false,
  }
}

function readViteEnv(name: string): string | undefined {
  // `import.meta.env` literal a propósito; ver el comentario homólogo en
  // adapters/azuro/config.ts (aliasear import.meta rompe la inyección de Vite).
  const env: Record<string, unknown> = import.meta.env ?? {}
  const value = env[name]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

/**
 * Lee la configuración del entorno Vite.
 *
 * - `VITE_LIMITLESS_API_TOKEN_ID` + `VITE_LIMITLESS_API_TOKEN_SECRET`:
 *   opcionales; ambas o ninguna. Sin ellas no hay órdenes ni posiciones.
 * - `VITE_LIMITLESS_AUTH_MODE=proxy`: la firma HMAC la pone el servidor
 *   (api/limitless-auth.ts con `LIMITLESS_API_TOKEN_*` sin prefijo VITE_).
 *   Incompatible con las credenciales VITE_: son estrategias excluyentes.
 * - `VITE_LIMITLESS_INCLUDE_SPORTS`: opcional, 'true' para listar deportes.
 * - `VITE_LIMITLESS_API_URL`: opcional. Por defecto, la ruta del proxy
 *   same-origin (ver `LIMITLESS_PROXY_PATH`): el navegador no puede llamar a
 *   la API directa por su allowlist de CORS.
 */
export function loadLimitlessConfigFromEnv(): LimitlessConfig {
  const tokenId = readViteEnv('VITE_LIMITLESS_API_TOKEN_ID')
  const secret = readViteEnv('VITE_LIMITLESS_API_TOKEN_SECRET')
  const proxyMode = readViteEnv('VITE_LIMITLESS_AUTH_MODE') === 'proxy'
  if ((tokenId === undefined) !== (secret === undefined)) {
    throw new Error(
      'VITE_LIMITLESS_API_TOKEN_ID y VITE_LIMITLESS_API_TOKEN_SECRET van juntas: define ambas o ninguna',
    )
  }
  if (proxyMode && tokenId !== undefined) {
    throw new Error(
      'VITE_LIMITLESS_AUTH_MODE=proxy y las credenciales VITE_LIMITLESS_API_TOKEN_* son excluyentes: con el proxy firmando, el secreto no debe entrar en el bundle',
    )
  }
  return makeLimitlessConfig({
    auth: proxyMode
      ? 'proxy'
      : tokenId !== undefined && secret !== undefined
        ? { tokenId, secret }
        : null,
    includeSports: readViteEnv('VITE_LIMITLESS_INCLUDE_SPORTS') === 'true',
    apiUrl: readViteEnv('VITE_LIMITLESS_API_URL') ?? LIMITLESS_PROXY_PATH,
  })
}
