/**
 * Registry de venues: la colección de `MarketSource` activos.
 *
 * Puro dominio: no sabe qué venues existen ni cómo se construyen. La
 * composición (qué adaptadores, con qué configuración) vive en
 * `services/marketSources.ts`; la UI solo consume esta interfaz.
 *
 * Criterio de éxito de la arquitectura: añadir un venue nuevo = registrar un
 * `MarketSource` más aquí, cero cambios en la UI.
 */
import { parseMarketId, type MarketSource, type VenueId } from './types.ts'

export interface MarketSourceRegistry {
  readonly sources: readonly MarketSource[]
  /** La fuente que emitió este id de mercado, o `null` si ninguna. */
  sourceFor(marketId: string): MarketSource | null
  byVenue(venue: VenueId): MarketSource | null
}

export function createRegistry(
  sources: readonly MarketSource[],
): MarketSourceRegistry {
  const byVenue = new Map<VenueId, MarketSource>(
    sources.map((source) => [source.venue, source]),
  )
  if (byVenue.size !== sources.length) {
    throw new Error('Hay dos fuentes registradas con el mismo venue id')
  }
  return {
    sources,
    byVenue: (venue) => byVenue.get(venue) ?? null,
    sourceFor(marketId) {
      const parsed = parseMarketId(marketId)
      if (parsed === null) return null
      return byVenue.get(parsed.venue) ?? null
    },
  }
}
