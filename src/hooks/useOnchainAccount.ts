/**
 * Estado on-chain real de tu cuenta en Polygon: saldo de USDC, aprobaciones y
 * las transacciones firmadas para concederlas.
 *
 * Para poder operar en Polymarket hacen falta DOS aprobaciones:
 *
 *   1. ERC20: el exchange puede gastar tu USDC     -> approve(exchange, monto)
 *   2. ERC1155: el exchange puede mover tus shares -> setApprovalForAll(exchange, true)
 *
 * La segunda se olvida a menudo y provoca que las ventas fallen sin motivo
 * aparente.
 *
 * Sobre el monto del approve: se aprueba una cantidad EXACTA elegida por ti, no
 * `MaxUint256`. Aprobar infinito es cómodo y es exactamente lo que explotan los
 * contratos maliciosos; aquí se prefiere firmar más veces.
 */

import { useCallback, useMemo } from 'react'
import { useAccount, useReadContracts, useWriteContract } from 'wagmi'
import { parseUnits, formatUnits, type Address } from 'viem'
import { polygon } from 'wagmi/chains'
import {
  CONTRACTS,
  USDC_DECIMALS,
  exchangeFor,
  sharesContractFor,
} from '../config/polymarket'
import { CONDITIONAL_TOKENS_ABI, ERC20_ABI } from '../services/abis'

export interface OnchainAccountState {
  address: Address | null
  isConnected: boolean
  /** Saldo real de USDC.e, en unidades humanas. */
  usdcBalance: number
  /** Cuánto USDC tiene permitido gastar el exchange estándar. */
  usdcAllowance: number
  /** Cuánto USDC tiene permitido gastar el exchange negRisk. */
  usdcAllowanceNegRisk: number
  /** El exchange estándar puede mover tus shares del CTF. */
  sharesApproved: boolean
  /** El exchange negRisk puede mover tus shares del adaptador. */
  sharesApprovedNegRisk: boolean
  isLoading: boolean
  error: Error | null
  refetch: () => void
}

export function useOnchainAccount(): OnchainAccountState {
  const { address, isConnected } = useAccount()

  const enabled = Boolean(address)
  const owner = address as Address | undefined

  const { data, isLoading, error, refetch } = useReadContracts({
    contracts: enabled
      ? [
          {
            address: CONTRACTS.collateral as Address,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [owner!],
            chainId: polygon.id,
          },
          {
            address: CONTRACTS.collateral as Address,
            abi: ERC20_ABI,
            functionName: 'allowance',
            args: [owner!, CONTRACTS.exchange as Address],
            chainId: polygon.id,
          },
          {
            address: CONTRACTS.collateral as Address,
            abi: ERC20_ABI,
            functionName: 'allowance',
            args: [owner!, CONTRACTS.negRiskExchange as Address],
            chainId: polygon.id,
          },
          {
            address: CONTRACTS.conditionalTokens as Address,
            abi: CONDITIONAL_TOKENS_ABI,
            functionName: 'isApprovedForAll',
            args: [owner!, CONTRACTS.exchange as Address],
            chainId: polygon.id,
          },
          {
            address: CONTRACTS.negRiskAdapter as Address,
            abi: CONDITIONAL_TOKENS_ABI,
            functionName: 'isApprovedForAll',
            args: [owner!, CONTRACTS.negRiskExchange as Address],
            chainId: polygon.id,
          },
        ]
      : [],
    query: { enabled, refetchInterval: 30_000 },
  })

  const toHuman = (v: unknown) =>
    typeof v === 'bigint' ? Number(formatUnits(v, USDC_DECIMALS)) : 0

  return useMemo(
    () => ({
      address: (address as Address) ?? null,
      isConnected,
      usdcBalance: toHuman(data?.[0]?.result),
      usdcAllowance: toHuman(data?.[1]?.result),
      usdcAllowanceNegRisk: toHuman(data?.[2]?.result),
      sharesApproved: data?.[3]?.result === true,
      sharesApprovedNegRisk: data?.[4]?.result === true,
      isLoading,
      error: (error as Error) ?? null,
      refetch,
    }),
    [address, isConnected, data, isLoading, error, refetch],
  )
}

/**
 * Transacciones de aprobación. Cada una abre la wallet para que TÚ la firmes.
 */
export function useApprovals() {
  const { writeContractAsync, isPending } = useWriteContract()

  /**
   * Aprueba una cantidad exacta de USDC para el exchange correspondiente.
   * @param amountUsd cantidad en USD (no en unidades base)
   */
  const approveUsdc = useCallback(
    async (amountUsd: number, negRisk: boolean): Promise<`0x${string}`> => {
      if (!(amountUsd > 0)) throw new Error('El monto debe ser mayor que cero.')
      return writeContractAsync({
        address: CONTRACTS.collateral as Address,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [exchangeFor(negRisk), parseUnits(String(amountUsd), USDC_DECIMALS)],
        chainId: polygon.id,
      })
    },
    [writeContractAsync],
  )

  /** Autoriza (o revoca) al exchange a mover tus shares ERC1155. */
  const setSharesApproval = useCallback(
    async (approved: boolean, negRisk: boolean): Promise<`0x${string}`> =>
      writeContractAsync({
        address: sharesContractFor(negRisk),
        abi: CONDITIONAL_TOKENS_ABI,
        functionName: 'setApprovalForAll',
        args: [exchangeFor(negRisk), approved],
        chainId: polygon.id,
      }),
    [writeContractAsync],
  )

  return { approveUsdc, setSharesApproval, isPending }
}

/** Lee cuántas shares posees de unos token IDs concretos. */
export function useShareBalances(tokenIds: string[]) {
  const { address } = useAccount()
  const enabled = Boolean(address) && tokenIds.length > 0

  const { data, isLoading, refetch } = useReadContracts({
    contracts: enabled
      ? tokenIds.map((id) => ({
          address: CONTRACTS.conditionalTokens as Address,
          abi: CONDITIONAL_TOKENS_ABI,
          functionName: 'balanceOf' as const,
          args: [address as Address, BigInt(id)],
          chainId: polygon.id,
        }))
      : [],
    query: { enabled, refetchInterval: 30_000 },
  })

  const balances = useMemo(() => {
    const out: Record<string, number> = {}
    tokenIds.forEach((id, i) => {
      const r = data?.[i]?.result
      out[id] = typeof r === 'bigint' ? Number(formatUnits(r, USDC_DECIMALS)) : 0
    })
    return out
  }, [tokenIds, data])

  return { balances, isLoading, refetch }
}
