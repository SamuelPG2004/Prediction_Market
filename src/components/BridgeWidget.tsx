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
import { BSC_CHAIN_ID } from '../config/chains'

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
