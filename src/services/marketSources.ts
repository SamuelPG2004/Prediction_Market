/**
 * PUNTO DE COMPOSICIÓN de los venues.
 *
 * Este es el único archivo fuera de `src/adapters/` que puede importar
 * adaptadores concretos: aquí se decide qué venues existen y cómo se
 * construyen. La UI consume exclusivamente el registry del dominio; si mañana
 * hay un tercer venue, se añade aquí y ningún componente cambia.
 *
 * Los puentes de wallet son PEREZOSOS: resuelven los clientes viem de wagmi en
 * el momento de la operación, porque al construir los adaptadores (arranque de
 * la app) todavía no hay wallet conectada. Si al operar sigue sin haberla,
 * wagmi lanza y el adaptador lo devuelve como error tipado de wallet.
 */
import {
  getChainId,
  getPublicClient,
  getWalletClient,
  switchChain,
} from 'wagmi/actions'
import type { PublicClient, WalletClient } from 'viem'
import { createRegistry, type MarketSourceRegistry } from '../domain/registry'
import type { VenueId } from '../domain/types'
import {
  AzuroAdapter,
  createAzuroGateway,
  createViemWalletBridge,
  loadAzuroConfigFromEnv,
  type AzuroWalletBridge,
} from '../adapters/azuro'
import {
  LimitlessAdapter,
  createLimitlessGateway,
  createViemLimitlessWalletBridge,
  loadLimitlessConfigFromEnv,
  type LimitlessWalletBridge,
} from '../adapters/limitless'
import { wagmiConfig } from '../config/wagmi'

/** Token con el que se apuesta en cada venue, para mostrar saldos en la UI. */
export interface VenueTokenInfo {
  venue: VenueId
  /** Nombre para mostrar del venue (viene de su adaptador). */
  displayName: string
  chainId: number
  address: `0x${string}`
  symbol: string
  decimals: number
}

/**
 * USDC canónico en Base, colateral de Limitless. Verificado contra los
 * payloads reales de su API (campo `collateralToken`).
 */
const BASE_USDC = {
  address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`,
  symbol: 'USDC',
  decimals: 6,
}

/** Cambia la wallet a la cadena del venue si hace falta, y da los clientes. */
async function viemClientsFor(
  chainId: number,
): Promise<{ publicClient: PublicClient; walletClient: WalletClient }> {
  const publicClient = getPublicClient(wagmiConfig, {
    chainId: chainId as 137 | 8453,
  }) as PublicClient
  if (getChainId(wagmiConfig) !== chainId) {
    await switchChain(wagmiConfig, { chainId: chainId as 137 | 8453 })
  }
  const walletClient = await getWalletClient(wagmiConfig, {
    chainId: chainId as 137 | 8453,
  })
  return { publicClient, walletClient }
}

function lazyAzuroBridge(chainId: number): AzuroWalletBridge {
  const bridge = async () => {
    const { publicClient, walletClient } = await viemClientsFor(chainId)
    return createViemWalletBridge(publicClient, walletClient)
  }
  return {
    readAllowance: async (...args) => (await bridge()).readAllowance(...args),
    approve: async (...args) => (await bridge()).approve(...args),
    signBetTypedData: async (...args) => (await bridge()).signBetTypedData(...args),
    withdrawPayout: async (...args) => (await bridge()).withdrawPayout(...args),
  }
}

function lazyLimitlessBridge(chainId: number): LimitlessWalletBridge {
  const bridge = async () => {
    const { publicClient, walletClient } = await viemClientsFor(chainId)
    return createViemLimitlessWalletBridge(publicClient, walletClient)
  }
  return {
    readAllowance: async (...args) => (await bridge()).readAllowance(...args),
    approve: async (...args) => (await bridge()).approve(...args),
    signOrderTypedData: async (...args) =>
      (await bridge()).signOrderTypedData(...args),
  }
}

const azuroConfig = loadAzuroConfigFromEnv()
const limitlessConfig = loadLimitlessConfigFromEnv()

const azuro = new AzuroAdapter({
  config: azuroConfig,
  gateway: createAzuroGateway(azuroConfig.chainId),
  wallet: lazyAzuroBridge(azuroConfig.chainId),
})

const limitless = new LimitlessAdapter({
  config: limitlessConfig,
  gateway: createLimitlessGateway(limitlessConfig),
  wallet: lazyLimitlessBridge(limitlessConfig.chainId),
})

/** El registry de la app. La UI no conoce nada más concreto que esto. */
export const marketSources: MarketSourceRegistry = createRegistry([
  azuro,
  limitless,
])

/** Tokens de apuesta por venue, como datos neutros para la UI. */
export const venueTokens: VenueTokenInfo[] = [
  {
    venue: azuro.venue,
    displayName: azuro.displayName,
    chainId: azuroConfig.chainId,
    address: azuroConfig.betToken.address,
    symbol: azuroConfig.betToken.symbol,
    decimals: azuroConfig.betToken.decimals,
  },
  {
    venue: limitless.venue,
    displayName: limitless.displayName,
    chainId: limitlessConfig.chainId,
    ...BASE_USDC,
  },
]
