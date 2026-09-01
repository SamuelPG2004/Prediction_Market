/**
 * Configuración de red de Azuro. ÚNICO lugar donde se decide cadena, token y
 * dirección de afiliado. El resto del adaptador la recibe ya resuelta.
 */
import { chainsData, type ChainId } from '@azuro-org/toolkit'
import { isAddress, type Address } from 'viem'

/** Cadenas de Azuro que este proyecto soporta. Producción: Polygon y Base. */
const SUPPORTED_CHAIN_IDS = [137, 8453, 80002, 84532] as const

export type AzuroChainId = (typeof SUPPORTED_CHAIN_IDS)[number]

export const DEFAULT_AZURO_CHAIN_ID: AzuroChainId = 137 // Polygon

export interface AzuroConfig {
  chainId: AzuroChainId
  /**
   * Dirección de afiliado que viaja en cada apuesta. Viene de la variable de
   * entorno `VITE_AZURO_AFFILIATE_ADDRESS`; nunca se hardcodea. Si falta, el
   * adaptador declara `canPlaceBet: false` y `placeBet` devuelve `unsupported`.
   */
  affiliate: Address | null
  /** Token de apuesta de la cadena (USDT en Polygon), según el protocolo. */
  betToken: {
    address: Address
    symbol: string
    decimals: number
  }
  /** Dirección del relayer, que necesita allowance del token de apuesta. */
  relayerAddress: Address
  /** Dirección del contrato core, dominio de la firma EIP-712. */
  coreAddress: Address
  /** Dirección del LP, contra el que se cobran los premios (withdrawPayout). */
  lpAddress: Address
  /** NFT AzuroBet: cada apuesta es un token; el cash out exige aprobarlo. */
  azuroBetAddress: Address
  /** Contrato de cash out (operador aprobado del NFT), o null si no existe. */
  cashoutAddress: Address | null
  /** Base del explorador de bloques de la cadena, o null si no hay conocido. */
  explorerBase: string | null
}

/** Exploradores por cadena soportada; para construir enlaces a transacciones. */
const EXPLORER_BASES: Partial<Record<AzuroChainId, string>> = {
  137: 'https://polygonscan.com',
  8453: 'https://basescan.org',
  80002: 'https://amoy.polygonscan.com',
  84532: 'https://sepolia.basescan.org',
}

function isSupportedChainId(value: number): value is AzuroChainId {
  return (SUPPORTED_CHAIN_IDS as readonly number[]).includes(value)
}

/** Construye la configuración para una cadena concreta. */
export function makeAzuroConfig(
  chainId: AzuroChainId,
  affiliate: Address | null,
): AzuroConfig {
  const data = chainsData[chainId as ChainId]
  return {
    chainId,
    affiliate,
    betToken: {
      address: data.betToken.address,
      symbol: data.betToken.symbol,
      decimals: data.betToken.decimals,
    },
    relayerAddress: data.contracts.relayer.address,
    coreAddress: data.contracts.core.address,
    lpAddress: data.contracts.lp.address,
    azuroBetAddress: data.contracts.azuroBet.address,
    cashoutAddress: data.contracts.cashout?.address ?? null,
    explorerBase: EXPLORER_BASES[chainId] ?? null,
  }
}

function readViteEnv(name: string): string | undefined {
  // `import.meta.env` tiene que aparecer LITERAL en este módulo: Vite solo
  // inyecta (dev) o reemplaza (build) el objeto env cuando encuentra esa
  // expresión exacta en el fuente. Aliasear import.meta a una variable dejaba
  // `env` undefined en runtime y todas las variables se leían vacías.
  const env: Record<string, unknown> = import.meta.env ?? {}
  const value = env[name]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

/**
 * Lee la configuración del entorno Vite.
 *
 * - `VITE_AZURO_CHAIN_ID`: opcional, por defecto Polygon (137).
 * - `VITE_AZURO_AFFILIATE_ADDRESS`: opcional; sin ella no se pueden colocar
 *   apuestas, pero el catálogo y las cotizaciones funcionan.
 */
export function loadAzuroConfigFromEnv(): AzuroConfig {
  const rawChainId = readViteEnv('VITE_AZURO_CHAIN_ID')
  let chainId: AzuroChainId = DEFAULT_AZURO_CHAIN_ID
  if (rawChainId !== undefined) {
    const parsed = Number(rawChainId)
    if (!Number.isInteger(parsed) || !isSupportedChainId(parsed)) {
      throw new Error(
        `VITE_AZURO_CHAIN_ID inválido: ${JSON.stringify(rawChainId)}. ` +
          `Soportados: ${SUPPORTED_CHAIN_IDS.join(', ')}`,
      )
    }
    chainId = parsed
  }

  const rawAffiliate = readViteEnv('VITE_AZURO_AFFILIATE_ADDRESS')
  let affiliate: Address | null = null
  if (rawAffiliate !== undefined) {
    if (!isAddress(rawAffiliate)) {
      throw new Error(
        'VITE_AZURO_AFFILIATE_ADDRESS no es una dirección EVM válida',
      )
    }
    affiliate = rawAffiliate
  }

  return makeAzuroConfig(chainId, affiliate)
}
