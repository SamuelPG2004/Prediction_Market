import { createConfig, fallback, http, injected } from 'wagmi'
import { polygon } from 'wagmi/chains'
import { coinbaseWallet, metaMask } from '@wagmi/connectors'
import { CUSTOM_RPC_URL, POLYGON_RPC_URLS } from './polymarket'

// Re-export para no romper imports existentes.
export { CONTRACTS as POLYMARKET_CONTRACTS, POLYGON_RPC_URLS } from './polymarket'

/**
 * Transportes con fallback: si un RPC falla, viem prueba el siguiente.
 *
 * Los RPCs que traía el proyecto estaban todos caídos (ver polymarket.ts).
 * Si defines VITE_POLYGON_RPC_URL, ese va primero.
 */
const rpcUrls = [
  ...(CUSTOM_RPC_URL ? [CUSTOM_RPC_URL] : []),
  ...POLYGON_RPC_URLS,
]

export const wagmiConfig = createConfig({
  chains: [polygon],
  connectors: [
    injected(),
    metaMask(),
    coinbaseWallet({ appName: 'Aether Markets' }),
  ],
  transports: {
    [polygon.id]: fallback(
      rpcUrls.map((url) => http(url, { timeout: 15_000 })),
      { rank: false },
    ),
  },
  ssr: false,
})

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig
  }
}
