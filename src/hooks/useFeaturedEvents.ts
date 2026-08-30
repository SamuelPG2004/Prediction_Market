/**
 * Partidos destacados: lo más apostado ahora mismo, para el carrusel de
 * portada. Solo consulta a los venues que declaran `canRankPopular`; los demás
 * ni se tocan (pedirles popularidad sería fingirla con su orden por defecto).
 *
 * La sección es azúcar sobre el catálogo: si ninguna fuente responde, el hook
 * devuelve lista vacía y la UI simplemente no la pinta — jamás rompe la vista
 * principal. Solo conoce el dominio.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Market, MarketFilter } from '../domain/types'
import { marketSources } from '../services/marketSources'
import {
  groupMarketsIntoEvents,
  type MarketEventView,
} from '../utils/eventGrouping'

const REFRESH_MS = 30_000

const FEATURED_FILTER: MarketFilter = {
  category: 'sports',
  orderBy: 'popularity',
}

export interface UseFeaturedEventsState {
  events: MarketEventView[]
  isLoading: boolean
}

export function useFeaturedEvents(count: number): UseFeaturedEventsState {
  const [markets, setMarkets] = useState<Market[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const rankingSources = useMemo(
    () => marketSources.sources.filter((s) => s.capabilities.canRankPopular),
    [],
  )

  const fetchAll = useCallback(async (): Promise<Market[] | null> => {
    if (rankingSources.length === 0) return []
    const results = await Promise.all(
      rankingSources.map((source) => source.listMarkets(FEATURED_FILTER)),
    )
    // Errores tipados, no excepciones: una fuente caída aporta cero mercados;
    // si TODAS fallan se devuelve null para no vaciar lo ya mostrado.
    const pages = results.filter((r) => r.ok)
    if (pages.length === 0) return null
    return pages.flatMap((r) => (r.ok ? r.data.markets : []))
  }, [rankingSources])

  const loadedRef = useRef(false)

  useEffect(() => {
    let alive = true

    const initial = async () => {
      const fresh = await fetchAll()
      if (!alive) return
      if (fresh !== null) {
        setMarkets(fresh)
        loadedRef.current = true
      }
      setIsLoading(false)
    }
    void initial()

    // Refresco en sitio: actualiza cuotas de lo ya mostrado sin reordenar el
    // carrusel bajo el cursor. Un fallo deja los datos en pantalla como están.
    const timer = window.setInterval(async () => {
      if (!loadedRef.current) return
      if (typeof document !== 'undefined' && document.hidden) return
      const fresh = await fetchAll()
      if (!alive || fresh === null) return
      const byId = new Map(fresh.map((m) => [m.id, m]))
      setMarkets((prev) => prev.map((old) => byId.get(old.id) ?? old))
    }, REFRESH_MS)

    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [fetchAll])

  const events = useMemo(
    () =>
      groupMarketsIntoEvents(markets)
        // El carrusel pinta enfrentamientos: sin dos participantes no hay
        // tarjeta "A vs B" que mostrar.
        .filter((e) => e.participants !== undefined && e.participants.length === 2)
        .slice(0, count),
    [markets, count],
  )

  return { events, isLoading }
}
