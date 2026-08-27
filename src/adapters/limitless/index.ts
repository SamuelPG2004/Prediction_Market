/**
 * Punto de entrada del adaptador de Limitless.
 *
 * Uso previsto desde el registry (fase posterior):
 *
 *   const adapter = createLimitlessAdapter()             // solo lectura
 *   const adapter = createLimitlessAdapter({ wallet })   // con órdenes
 */
import type { MarketSource } from '../../domain/types.ts'
import { LimitlessAdapter } from './LimitlessAdapter.ts'
import { loadLimitlessConfigFromEnv } from './config.ts'
import { createLimitlessGateway, type LimitlessWalletBridge } from './gateway.ts'

export { LimitlessAdapter, LIMITLESS_VENUE_ID } from './LimitlessAdapter.ts'
export type { LimitlessAdapterDeps } from './LimitlessAdapter.ts'
export {
  loadLimitlessConfigFromEnv,
  makeLimitlessConfig,
  LIMITLESS_CHAIN_ID,
  type LimitlessAuth,
  type LimitlessConfig,
} from './config.ts'
export {
  createLimitlessGateway,
  createViemLimitlessWalletBridge,
  type LimitlessGateway,
  type LimitlessWalletBridge,
} from './gateway.ts'

/**
 * Fabrica el adaptador con la configuración del entorno Vite y la pasarela
 * real. Lanza si las variables de entorno están malformadas (fallo de
 * despliegue, mejor en el arranque que en la primera orden).
 */
export function createLimitlessAdapter(options?: {
  wallet?: LimitlessWalletBridge
}): MarketSource {
  const config = loadLimitlessConfigFromEnv()
  return new LimitlessAdapter({
    config,
    gateway: createLimitlessGateway(config),
    wallet: options?.wallet,
  })
}
