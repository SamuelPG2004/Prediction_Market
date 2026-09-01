/**
 * Cuántas posiciones COBRABLES tiene la wallet conectada, sumando todos los
 * venues. Alimenta el badge del navbar: dinero pendiente de cobrar debe verse
 * sin tener que abrir el cajón de posiciones.
 *
 * Sondeo cada 2 min vía react-query: las posiciones cambian despacio (solo al
 * resolverse mercados) y las APIs de posiciones no son gratis. Los venues sin
 * soporte o con error cuentan 0: un badge nunca debe romper la barra.
 */
import { useQuery } from '@tanstack/react-query'
import { useAccount } from 'wagmi'
import { marketSources } from '../services/marketSources'

export function useRedeemableCount(): number {
  const { address } = useAccount()

  const { data } = useQuery({
    queryKey: ['redeemable-count', address],
    enabled: address !== undefined,
    refetchInterval: 120_000,
    queryFn: async () => {
      const counts = await Promise.all(
        marketSources.sources.map(async (source) => {
          if (!source.capabilities.canReadPositions) return 0
          const result = await source.getPositions(address as `0x${string}`)
          if (!result.ok) return 0
          return result.data.filter((p) => p.status === 'redeemable').length
        }),
      )
      return counts.reduce((a, n) => a + n, 0)
    },
  })

  return data ?? 0
}
