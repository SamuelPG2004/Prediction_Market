import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { wagmiConfig } from '../config/wagmi'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 2,
      staleTime: 30_000,
    },
  },
})

/**
 * Provee wagmi + react-query.
 *
 * La app funciona sin wallet conectada: conectarla solo añade tu identidad y
 * la lectura de tu saldo real de USDC. Los mercados y la contabilidad de
 * práctica viven en useMarketStore, no aquí.
 */
export function Web3Provider({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  )
}
