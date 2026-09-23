import React, { useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { wagmiConfig } from '../config/wagmi'
import { localWalletVault } from '../services/localWallet'
import { SignatureConfirmModal } from '../components/SignatureConfirmModal'
import { PrivyAuthProvider } from './PrivyAuthProvider'

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
 * La app funciona sin wallet conectada (navegar y cotizar son de solo
 * lectura); conectarla habilita saldos, posiciones y la firma de órdenes.
 */
export function Web3Provider({ children }: { children: React.ReactNode }) {
  // Actividad del usuario → reinicia la cuenta atrás del auto-bloqueo de la
  // wallet local. Eventos discretos a propósito (nada de pointermove): tocar
  // el timer decenas de veces por segundo no aporta.
  useEffect(() => {
    const touch = () => localWalletVault.touch()
    window.addEventListener('pointerdown', touch)
    window.addEventListener('keydown', touch)
    return () => {
      window.removeEventListener('pointerdown', touch)
      window.removeEventListener('keydown', touch)
    }
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>
        <PrivyAuthProvider>
          {children}
          {/*
            Diálogo de confirmación de firma de la wallet local. Se monta aquí,
            fuera de cualquier vista, porque una firma puede pedirla cualquier
            parte de la app (apuesta, retiro, bridge) y debe poder interrumpir
            lo que sea.
          */}
          <SignatureConfirmModal />
        </PrivyAuthProvider>
      </WagmiProvider>
    </QueryClientProvider>
  )
}
