/**
 * Capa Web3: identidad y lectura de saldo.
 *
 * Alcance deliberadamente reducido. Lo que hace de verdad:
 *   - conectar una wallet (MetaMask, Coinbase, inyectada) y darte tu dirección
 *   - leer tu saldo real de USDC en Polygon, en modo SOLO LECTURA
 *   - cambiar de red
 *
 * Lo que NO hace, y por qué: no envía transacciones ni opera contra los
 * contratos de Polymarket. Operar en Polymarket requiere firmar órdenes EIP-712
 * y enviarlas autenticadas a su CLOB API; no es una llamada directa al
 * contrato. La versión anterior de este archivo declaraba una función
 * `trade(uint256,uint256)` en el CTF Exchange que no existe, así que cualquier
 * orden habría revertido.
 *
 * Tus mercados y tu contabilidad viven en useMarketStore (saldo de práctica).
 */

import {
  useAccount,
  useChainId,
  useConnect,
  useDisconnect,
  useReadContract,
  useSwitchChain,
} from 'wagmi'
import { polygon } from 'wagmi/chains'
import { formatUnits, type Address } from 'viem'
import { POLYMARKET_CONTRACTS } from '../config/wagmi'

/** USDC en Polygon usa 6 decimales, no 18. */
const USDC_DECIMALS = 6

/** ABI mínima de ERC20: solo lo necesario para leer saldo. */
export const ERC20_BALANCE_ABI = [
  {
    inputs: [{ name: 'owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

/** Formatea un monto de USDC (6 decimales) para mostrar. */
export function formatUsdc(amount: bigint): string {
  return Number(formatUnits(amount, 6)).toFixed(2)
}

/** Construye el enlace a Polygonscan para una dirección. */
export function polygonscanAddressUrl(address: string): string {
  return `https://polygonscan.com/address/${address}`
}

/**
 * Hook de wallet. Devuelve identidad, red y tu saldo real de USDC en Polygon.
 *
 * `usdcBalance` es informativo: la app no lo gasta ni lo mueve.
 */
export function useWallet() {
  const { address, isConnected, status } = useAccount()
  const { connect, connectors, isPending, error: connectError } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain } = useSwitchChain()
  const chainId = useChainId()

  const isCorrectChain = chainId === polygon.id

  // wagmi v3 quitó el parámetro `token` de useBalance: para un ERC20 hay que
  // leer balanceOf directamente. Las opciones de react-query van en `query`.
  const { data: rawBalance, isLoading: isBalanceLoading } = useReadContract({
    address: POLYMARKET_CONTRACTS.collateral as Address,
    abi: ERC20_BALANCE_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: polygon.id,
    query: { enabled: Boolean(address) },
  })

  return {
    address: address ?? null,
    isConnected,
    status,
    chainId,
    isCorrectChain,
    connect,
    connectors,
    isConnecting: isPending,
    connectError,
    disconnect,
    switchToPolygon: () => switchChain({ chainId: polygon.id }),
    /** Saldo real de USDC en Polygon. Solo lectura. */
    usdcBalance:
      rawBalance !== undefined
        ? Number(formatUnits(rawBalance, USDC_DECIMALS))
        : 0,
    isBalanceLoading,
  }
}
