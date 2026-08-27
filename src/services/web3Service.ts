/**
 * Capa Web3: identidad de la wallet.
 *
 * Alcance deliberadamente reducido: conectar/desconectar y saber en qué red
 * estás. Los saldos por venue los lee `useVenueBalances`, y las operaciones
 * (aprobaciones, firmas) las hacen los adaptadores a través de sus puentes de
 * wallet — nunca esta capa.
 */
import {
  useAccount,
  useChainId,
  useConnect,
  useDisconnect,
  useSwitchChain,
} from 'wagmi'

export function useWallet() {
  const { address, isConnected, status } = useAccount()
  const { connect, connectors, isPending, error: connectError } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain } = useSwitchChain()
  const chainId = useChainId()

  return {
    address: address ?? null,
    isConnected,
    status,
    chainId,
    connect,
    connectors,
    isConnecting: isPending,
    connectError,
    disconnect,
    switchTo: (target: number) => switchChain({ chainId: target as 137 | 8453 }),
  }
}
