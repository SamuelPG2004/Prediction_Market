/**
 * Punto de entrada del adaptador de Azuro.
 *
 * Uso previsto desde el registry (fase posterior):
 *
 *   const adapter = createAzuroAdapter()                 // solo lectura
 *   const adapter = createAzuroAdapter({ wallet })       // con apuestas
 */
import type { MarketSource } from '../../domain/types.ts'
import { AzuroAdapter } from './AzuroAdapter.ts'
import { loadAzuroConfigFromEnv } from './config.ts'
import { createAzuroGateway, type AzuroWalletBridge } from './gateway.ts'

export { AzuroAdapter, AZURO_VENUE_ID } from './AzuroAdapter.ts'
export type { AzuroAdapterDeps } from './AzuroAdapter.ts'
export {
  loadAzuroConfigFromEnv,
  makeAzuroConfig,
  DEFAULT_AZURO_CHAIN_ID,
  type AzuroChainId,
  type AzuroConfig,
} from './config.ts'
export {
  createAzuroGateway,
  createViemWalletBridge,
  type AzuroGateway,
  type AzuroWalletBridge,
} from './gateway.ts'

/**
 * Fabrica el adaptador con la configuración del entorno Vite y la pasarela
 * real. Lanza si las variables de entorno están malformadas (fallo de
 * despliegue, mejor en el arranque que en la primera apuesta).
 */
export function createAzuroAdapter(options?: {
  wallet?: AzuroWalletBridge
}): MarketSource {
  const config = loadAzuroConfigFromEnv()
  return new AzuroAdapter({
    config,
    gateway: createAzuroGateway(config.chainId),
    wallet: options?.wallet,
  })
}
