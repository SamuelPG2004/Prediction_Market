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
   */
  auth: LimitlessAuth | null
  /**
   * El plan de venues asigna los deportes a Azuro; Limitless es la fuente
   * NO deportiva. Por defecto sus mercados con dominio `sport` se omiten
   * para no duplicar catálogo. Ponlo a true para listarlos también.
   */
  includeSports: boolean
}

export function makeLimitlessConfig(options?: {
  auth?: LimitlessAuth | null
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
  const meta = import.meta as unknown as { env?: Record<string, unknown> }
  const value = meta.env?.[name]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

/**
 * Lee la configuración del entorno Vite.
 *
 * - `VITE_LIMITLESS_API_TOKEN_ID` + `VITE_LIMITLESS_API_TOKEN_SECRET`:
 *   opcionales; ambas o ninguna. Sin ellas no hay órdenes ni posiciones.
 * - `VITE_LIMITLESS_INCLUDE_SPORTS`: opcional, 'true' para listar deportes.
 */
export function loadLimitlessConfigFromEnv(): LimitlessConfig {
  const tokenId = readViteEnv('VITE_LIMITLESS_API_TOKEN_ID')
  const secret = readViteEnv('VITE_LIMITLESS_API_TOKEN_SECRET')
  if ((tokenId === undefined) !== (secret === undefined)) {
    throw new Error(
      'VITE_LIMITLESS_API_TOKEN_ID y VITE_LIMITLESS_API_TOKEN_SECRET van juntas: define ambas o ninguna',
    )
  }
  return makeLimitlessConfig({
    auth: tokenId !== undefined && secret !== undefined ? { tokenId, secret } : null,
    includeSports: readViteEnv('VITE_LIMITLESS_INCLUDE_SPORTS') === 'true',
  })
}
