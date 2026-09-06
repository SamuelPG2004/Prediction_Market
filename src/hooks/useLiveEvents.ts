/**
 * Partidos EN JUEGO ahora mismo, para la sección "En vivo" de la portada y de
 * Deportes. Pide a todos los venues su listado en vivo (`state: 'live'`; los
 * que no tienen en-vivo responden vacío por contrato) y refresca deprisa: en
 * un partido en juego las cuotas se mueven en segundos, no en minutos.
 *
 * A diferencia de los destacados, aquí la lista SÍ cambia de miembros: un
 * partido que termina debe salir y uno que arranca debe entrar. Para no
 * recolocar tarjetas bajo el cursor, los que siguen conservan su posición y
 * los nuevos entran al final.
 *
 * La sección es azúcar sobre el catálogo: sin datos, la UI no la pinta.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Market, MarketFilter } from '../domain/types'
import { marketSources } from '../services/marketSources'
import {
  groupMarketsIntoEvents,
  type MarketEventView,
} from '../utils/eventGrouping'

const REFRESH_MS = 12_000

const LIVE_FILTER: MarketFilter = {
  category: 'sports',
  state: 'live',
}

export interface UseLiveEventsState {
  events: MarketEventView[]
  isLoading: boolean
}

export function useLiveEvents(count: number): UseLiveEventsState {
  const [markets, setMarkets] = useState<Market[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchAll = useCallback(async (): Promise<Market[] | null> => {
    const results = await Promise.all(
      marketSources.sources.map((source) => source.listMarkets(LIVE_FILTER)),
    )
    // Errores tipados, no excepciones: una fuente caída aporta cero mercados;
    // si TODAS fallan se devuelve null para no vaciar lo ya mostrado.
    const pages = results.filter((r) => r.ok)
    if (pages.length === 0) return null
    return pages.flatMap((r) => (r.ok ? r.data.markets : []))
  }, [])

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

    const timer = window.setInterval(async () => {
      if (!loadedRef.current) return
      if (typeof document !== 'undefined' && document.hidden) return
      const fresh = await fetchAll()
      if (!alive || fresh === null) return
      setMarkets((prev) => {
        // Estabilidad de orden: lo que sigue vivo mantiene su sitio; lo
        // terminado desaparece; lo recién arrancado se añade al final.
        const freshById = new Map(fresh.map((m) => [m.id, m]))
        const kept = prev
          .filter((old) => freshById.has(old.id))
          .map((old) => {
            const next = freshById.get(old.id) as Market
            freshById.delete(old.id)
            return next
          })
        return [...kept, ...freshById.values()]
      })
    }, REFRESH_MS)

    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [fetchAll])

  const events = useMemo(
    () =>
      groupMarketsIntoEvents(markets)
        // El carrusel pinta enfrentamientos "A vs B"; y solo lo aún en juego
        // (el refresco puede traer un partido que acaba de resolverse).
        .filter(
          (e) =>
            e.isLive &&
            e.participants !== undefined &&
            e.participants.length === 2,
        )
        .slice(0, count),
    [markets, count],
  )

  return { events, isLoading }
}
