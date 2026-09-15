/**
 * Widget de LI.FI (el motor de Jumper) para traer fondos desde otras redes
 * (BNB Chain por defecto, donde mucha gente guarda su dinero de Binance)
 * hacia el token de apuesta de un venue.
 *
 * Export default + archivo propio a propósito: el widget pesa mucho y solo
 * debe descargarse al abrir el modal de bridge (React.lazy en BridgeModal).
 *
 * El widget detecta el WagmiProvider de la app y reutiliza la wallet ya
 * conectada; NUNCA mueve fondos solo — cada paso (aprobación, swap, bridge)
 * lo firma el usuario en su wallet.
 */
import { useMemo } from 'react'
import { LiFiWidget, type WidgetConfig } from '@lifi/widget'
import { EthereumProvider } from '@lifi/widget-provider-ethereum'
import {
  BASE_CHAIN_ID,
  BSC_CHAIN_ID,
  POLYGON_CHAIN_ID,
  rpcUrlsFor,
} from '../config/chains'

export interface BridgeDestination {
  /** Cadena de destino (la del venue). */
  chainId: number
  /** Token de apuesta del venue en esa cadena. */
  tokenAddress: string
}

interface BridgeWidgetProps {
  destination: BridgeDestination
  /** Cadenas de destino permitidas (las de los venues), para no acabar con
   * fondos en una red que la app no usa. */
  allowedDestinationChainIds: number[]
}

export default function BridgeWidget({
  destination,
  allowedDestinationChainIds,
}: BridgeWidgetProps) {
  const config = useMemo<WidgetConfig>(
    () => ({
      integrator: 'aether-markets',
      providers: [EthereumProvider()],
      fromChain: BSC_CHAIN_ID,
      toChain: destination.chainId,
      toToken: destination.tokenAddress,
      chains: {
        to: { allow: allowedDestinationChainIds },
      },
      // RPCs: los MISMOS que el resto de la app (config/chains.ts) en vez de
      // la lista interna del widget. Dos motivos: la lista interna cambia
      // entre versiones y mete hosts que el CSP de vercel.json no conoce
      // (se vio a bsc-dataseed.binance.org bloqueado y el saldo de BNB sin
      // cargar), y así el endpoint propio de VITE_*_RPC_URL también vale
      // aquí. Si se añade una cadena al bridge, va a chains.ts y al CSP.
      sdkConfig: {
        rpcUrls: {
          [BSC_CHAIN_ID]: rpcUrlsFor(BSC_CHAIN_ID),
          [POLYGON_CHAIN_ID]: rpcUrlsFor(POLYGON_CHAIN_ID),
          [BASE_CHAIN_ID]: rpcUrlsFor(BASE_CHAIN_ID),
        },
      },
      appearance: 'dark',
      languages: { default: 'es' },
      // El idioma y el tema los fija la app; sus selectores dentro del
      // widget solo confundirían.
      hiddenUI: { appearance: true, language: true },
      theme: {
        colorSchemes: {
          dark: {
            palette: {
              primary: { main: '#10b981' },
              secondary: { main: '#34d399' },
              background: { default: '#0f121a', paper: '#131620' },
            },
          },
        },
        shape: { borderRadius: 12, borderRadiusSecondary: 12 },
        container: { border: 'none', borderRadius: '0px' },
      },
    }),
    [destination.chainId, destination.tokenAddress, allowedDestinationChainIds],
  )

  return <LiFiWidget integrator="aether-markets" config={config} />
}
