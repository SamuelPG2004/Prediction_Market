import { createConfig, fallback, http, injected } from 'wagmi'
import { base, bsc, polygon } from 'wagmi/chains'
import { walletConnect } from '@wagmi/connectors'
import { rpcUrlsFor } from './chains'

/**
 * wagmi multi-chain: Polygon (Azuro) + Base (Limitless) + BNB Chain, que NO
 * aloja ningún venue: está solo para que el widget de bridge pueda leer saldos
 * y firmar la transacción de salida desde BSC (ver BridgeModal).
 *
 * Transportes con fallback: si un RPC falla, viem prueba el siguiente. El
 * endpoint propio de VITE_*_RPC_URL, si existe, va primero (ver chains.ts).
 *
 * Conectores, a propósito solo dos familias:
 *
 *  - `injected()`: cualquier extensión de wallet instalada en el navegador
 *    (MetaMask, Binance Wallet, Rabby…). wagmi las descubre por EIP-6963 y
 *    las lista por su nombre real; no hacen falta conectores dedicados.
 *  - `walletConnect`: wallets MÓVILES por QR (app de Binance, Trust…).
 *
 * Los conectores dedicados de MetaMask/Coinbase se quitaron adrede: cargan
 * bajo demanda SDKs que son peers opcionales de @wagmi/connectors y, si no
 * están instalados, el clic revienta con "Could not resolve @metamask/…".
 * Con EIP-6963 no aportan nada para extensiones ya instaladas.
 */
function transportFor(chainId: number) {
  return fallback(
    rpcUrlsFor(chainId).map((url) => http(url, { timeout: 15_000 })),
    { rank: false },
  )
}

function readViteEnv(name: string): string | undefined {
  // `import.meta.env` literal a propósito; ver el comentario homólogo en
  // adapters/azuro/config.ts (aliasear import.meta rompe la inyección de Vite).
  const env: Record<string, unknown> = import.meta.env ?? {}
  const value = env[name]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

/**
 * WalletConnect requiere un projectId gratuito de https://cloud.reown.com en
 * VITE_WALLETCONNECT_PROJECT_ID; sin él, el conector no se ofrece.
 */
const walletConnectProjectId = readViteEnv('VITE_WALLETCONNECT_PROJECT_ID')

export const wagmiConfig = createConfig({
  chains: [polygon, base, bsc],
  connectors: [
    injected(),
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
    [bsc.id]: transportFor(bsc.id),
  },
  ssr: false,
})

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig
  }
}
