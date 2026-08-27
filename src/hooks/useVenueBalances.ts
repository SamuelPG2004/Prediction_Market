/**
 * Saldos reales del token de apuesta de cada venue (solo lectura).
 *
 * La lista de tokens viene del punto de composición como datos neutros
 * ({venue, cadena, dirección, símbolo}); este hook solo lee `balanceOf`.
 */
import { useMemo } from 'react'
import { erc20Abi, formatUnits, type Address } from 'viem'
import { useAccount, useReadContracts } from 'wagmi'
import { venueTokens, type VenueTokenInfo } from '../services/marketSources'

export interface VenueBalance extends VenueTokenInfo {
  /** Saldo en unidades humanas, o `null` mientras carga / sin wallet. */
  balance: number | null
}

export function useVenueBalances(): {
  balances: VenueBalance[]
  isLoading: boolean
  refetch: () => void
} {
  const { address } = useAccount()
  const enabled = Boolean(address)

  const { data, isLoading, refetch } = useReadContracts({
    contracts: enabled
      ? venueTokens.map((token) => ({
          address: token.address,
          abi: erc20Abi,
          functionName: 'balanceOf' as const,
          args: [address as Address],
          chainId: token.chainId as 137 | 8453,
        }))
      : [],
    query: { enabled, refetchInterval: 30_000 },
  })

  const balances = useMemo(
    () =>
      venueTokens.map((token, i) => {
        const raw = data?.[i]?.result
        return {
          ...token,
          balance:
            typeof raw === 'bigint'
              ? Number(formatUnits(raw, token.decimals))
              : null,
        }
      }),
    [data],
  )

  return { balances, isLoading, refetch }
}
