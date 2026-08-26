/**
 * Configuración de Polymarket en Polygon Mainnet.
 *
 * TODAS las direcciones de este archivo están verificadas contra la cadena, no
 * copiadas de documentación. Se obtuvieron preguntando al propio CTFExchange
 * desplegado (`getCollateral()` / `getCtf()`) y coinciden con lo que devuelve
 * `getContractConfig(137)` del SDK oficial.
 *
 * Si necesitas volver a verificarlas:
 *   CTFExchange.getCollateral() -> collateral
 *   CTFExchange.getCtf()        -> conditionalTokens
 *   NegRiskCtfExchange.getCtf() -> negRiskAdapter
 */

export const POLYGON_CHAIN_ID = 137 as const

export const CONTRACTS = {
  /** USDC.e puenteado. 6 decimales (verificado: decimals() == 6). */
  collateral: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  /**
   * Gnosis ConditionalTokens (ERC1155 de las shares).
   *
   * OJO: el valor que traía este proyecto, `0x4D97DCd97eC945f40c65F87097ACe5EA0476045`,
   * tenía 39 caracteres hex y le faltaba una `F` en el medio. La dirección real
   * es la de abajo (`f40cF65F`), confirmada porque tiene código on-chain y
   * porque CTFExchange.getCtf() la devuelve.
   */
  conditionalTokens: '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045',
  /** Exchange para mercados normales. */
  exchange: '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E',
  /** Exchange para mercados negRisk (multi-resultado excluyente). */
  negRiskExchange: '0xC5d563A36AE78145C45a50134d48A1215220f80a',
  /**
   * Adaptador negRisk. Para estos mercados el "ctf" del exchange ES el
   * adaptador, así que las aprobaciones ERC1155 van aquí y no al CTF.
   */
  negRiskAdapter: '0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296',
} as const

export const USDC_DECIMALS = 6
/** Las shares del CTF son ERC1155 con 6 decimales en la contabilidad del CLOB. */
export const SHARES_DECIMALS = 6

/**
 * RPCs públicos de Polygon, verificados uno a uno el 2026-08-26.
 *
 * Los que traía el proyecto estaban TODOS muertos:
 *   polygon-rpc.com      -> HTTP 401 "API key disabled, tenant disabled"
 *   polygon.llamarpc.com -> fetch failed
 *   1rpc.io/polygon      -> HTTP 400 "unknown network"
 *   rpc.ankr.com/polygon -> exige API key
 *
 * Para uso serio, pon tu propio endpoint (Alchemy/Infura/dRPC con clave) en
 * VITE_POLYGON_RPC_URL: los públicos limitan peticiones y van y vienen.
 */
export const POLYGON_RPC_URLS = [
  'https://polygon-bor-rpc.publicnode.com',
  'https://polygon.drpc.org',
  'https://polygon.gateway.tenderly.co',
] as const

/** RPC propio opcional, con prioridad sobre los públicos. */
export const CUSTOM_RPC_URL: string | undefined =
  import.meta.env?.VITE_POLYGON_RPC_URL || undefined

export const GAMMA_API_BASE = 'https://gamma-api.polymarket.com'
export const CLOB_API_BASE = 'https://clob.polymarket.com'

export const EXPLORER_BASE = 'https://polygonscan.com'

export function txUrl(hash: string) {
  return `${EXPLORER_BASE}/tx/${hash}`
}

export function addressUrl(address: string) {
  return `${EXPLORER_BASE}/address/${address}`
}

/** Devuelve el exchange que corresponde según si el mercado es negRisk. */
export function exchangeFor(negRisk: boolean): `0x${string}` {
  return (negRisk ? CONTRACTS.negRiskExchange : CONTRACTS.exchange) as `0x${string}`
}

/**
 * Devuelve el contrato ERC1155 cuyas shares hay que aprobar.
 * En negRisk, el exchange opera contra el adaptador.
 */
export function sharesContractFor(negRisk: boolean): `0x${string}` {
  return (negRisk
    ? CONTRACTS.negRiskAdapter
    : CONTRACTS.conditionalTokens) as `0x${string}`
}
