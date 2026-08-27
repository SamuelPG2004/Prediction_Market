import { createConfig, fallback, http, injected } from 'wagmi'
import { base, polygon } from 'wagmi/chains'
import { coinbaseWallet, metaMask, walletConnect } from '@wagmi/connectors'
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

function readViteEnv(name: string): string | undefined {
  const meta = import.meta as unknown as { env?: Record<string, unknown> }
  const value = meta.env?.[name]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

/**
 * WalletConnect permite conectar wallets MÓVILES escaneando un QR (Binance,
 * Trust, Rainbow…). Requiere un projectId gratuito de https://cloud.reown.com
 * en VITE_WALLETCONNECT_PROJECT_ID; sin él, el conector no se ofrece.
 */
const walletConnectProjectId = readViteEnv('VITE_WALLETCONNECT_PROJECT_ID')

export const wagmiConfig = createConfig({
  chains: [polygon, base],
  connectors: [
    // Detecta las extensiones instaladas (MetaMask, Binance Wallet, Rabby…):
    // wagmi descubre por EIP-6963 cada wallet inyectada y la lista por nombre.
    injected(),
    metaMask(),
    coinbaseWallet({ appName: 'Aether Markets' }),
    ...(walletConnectProjectId !== undefined
      ? [
          walletConnect({
            projectId: walletConnectProjectId,
            metadata: {
              name: 'Aether Markets',
              description: 'Mercados de predicción reales',
              url: 'http://localhost:3000',
              icons: [],
            },
            showQrModal: true,
          }),
        ]
      : []),
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
