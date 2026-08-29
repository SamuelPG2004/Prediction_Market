/**
 * Cadenas soportadas y sus RPCs. Venue-agnóstico: aquí no hay nada de ningún
 * protocolo concreto, solo infraestructura de red.
 *
 * Los RPCs públicos de Polygon caducan sin aviso (los que traía el proyecto
 * originalmente estaban TODOS muertos: polygon-rpc.com daba 401, llamarpc no
 * resolvía, 1rpc devolvía 400 y ankr exige clave). Esta lista se verificó a
 * mano el 2026-08-26; los de Base, el 2026-08-27 (eth_chainId == 0x2105).
 *
 * Para uso serio, define tu propio endpoint con clave (Alchemy/Infura/dRPC)
 * en VITE_POLYGON_RPC_URL / VITE_BASE_RPC_URL: va primero en el fallback.
 */

export const POLYGON_CHAIN_ID = 137 as const
export const BASE_CHAIN_ID = 8453 as const
/**
 * BNB Chain no aloja ningún venue: está solo como red de ORIGEN del bridge
 * de fondos (mucha gente guarda su dinero en Binance/BSC). RPCs verificados
 * a mano el 2026-08-28 (eth_chainId == 0x38); drpc va último porque su plan
 * público rate-limita IPs compartidas (VPN).
 */
export const BSC_CHAIN_ID = 56 as const

export const POLYGON_RPC_URLS = [
  'https://polygon-bor-rpc.publicnode.com',
  'https://polygon.drpc.org',
  'https://polygon.gateway.tenderly.co',
] as const

export const BASE_RPC_URLS = [
  'https://mainnet.base.org',
  'https://base-rpc.publicnode.com',
  'https://base.drpc.org',
] as const

export const BSC_RPC_URLS = [
  'https://bsc-rpc.publicnode.com',
  'https://bsc-dataseed.bnbchain.org',
  'https://bsc.drpc.org',
] as const

function readViteEnv(name: string): string | undefined {
  const meta = import.meta as unknown as { env?: Record<string, unknown> }
  const value = meta.env?.[name]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

/** RPCs por cadena, con el endpoint propio (si existe) en cabeza. */
export function rpcUrlsFor(chainId: number): string[] {
  if (chainId === POLYGON_CHAIN_ID) {
    const custom = readViteEnv('VITE_POLYGON_RPC_URL')
    return [...(custom ? [custom] : []), ...POLYGON_RPC_URLS]
  }
  if (chainId === BASE_CHAIN_ID) {
    const custom = readViteEnv('VITE_BASE_RPC_URL')
    return [...(custom ? [custom] : []), ...BASE_RPC_URLS]
  }
  if (chainId === BSC_CHAIN_ID) {
    const custom = readViteEnv('VITE_BSC_RPC_URL')
    return [...(custom ? [custom] : []), ...BSC_RPC_URLS]
  }
  return []
}

const EXPLORERS: Record<number, { name: string; base: string }> = {
  [POLYGON_CHAIN_ID]: { name: 'Polygonscan', base: 'https://polygonscan.com' },
  [BASE_CHAIN_ID]: { name: 'Basescan', base: 'https://basescan.org' },
  [BSC_CHAIN_ID]: { name: 'BscScan', base: 'https://bscscan.com' },
}

export function explorerAddressUrl(chainId: number, address: string): string | null {
  const explorer = EXPLORERS[chainId]
  return explorer ? `${explorer.base}/address/${address}` : null
}

export function chainLabel(chainId: number): string {
  if (chainId === POLYGON_CHAIN_ID) return 'Polygon'
  if (chainId === BASE_CHAIN_ID) return 'Base'
  if (chainId === BSC_CHAIN_ID) return 'BNB Chain'
  return `Cadena ${chainId}`
}
