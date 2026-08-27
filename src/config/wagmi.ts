import { createConfig, fallback, http, injected } from 'wagmi'
import { base, polygon } from 'wagmi/chains'
import { coinbaseWallet, metaMask } from '@wagmi/connectors'
import { rpcUrlsFor } from './chains'

/**
 * wagmi multi-chain: Polygon (Azuro) + Base (Limitless).
 *
 * Transportes con fallback: si un RPC falla, viem prueba el siguiente. El
 * endpoint propio de VITE_*_RPC_URL, si existe, va primero (ver chains.ts).
 */
function transportFor(chainId: number) {
  return fallback(
    rpcUrlsFor(chainId).map((url) => http(url, { timeout: 15_000 })),
    { rank: false },
  )
}

export const wagmiConfig = createConfig({
  chains: [polygon, base],
  connectors: [
    injected(),
    metaMask(),
    coinbaseWallet({ appName: 'Aether Markets' }),
  ],
  transports: {
    [polygon.id]: transportFor(polygon.id),
    [base.id]: transportFor(base.id),
  },
  ssr: false,
})

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig
  }
}
