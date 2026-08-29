/**
 * Carga de mercados desde TODAS las fuentes registradas, agrupados en eventos
 * para la UI. Sustituye al antiguo hook de Polymarket conservando su contrato:
 *
 *  - PAGINACIÓN automática: `loadMore` lo dispara el scroll. Cada fuente lleva
 *    su propio cursor opaco; se agota una y las demás siguen.
 *  - REFRESCO en vivo: cada `refreshMs` se repide la primera página de cada
 *    fuente y se actualizan EN SITIO los mercados ya cargados. No reordena,
 *    no añade y no quita: si el listado se recolocara bajo el cursor, un clic
 *    podría acabar en un mercado distinto del pretendido.
 *
 * Este hook solo conoce el dominio: `MarketSource`, `Market`, `MarketFilter`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  Market,
  MarketCategory,
  MarketFilter,
  MarketSource,
} from '../domain/types'
import { marketSources } from '../services/marketSources'
import {
  groupMarketsIntoEvents,
  type MarketEventView,
} from '../utils/eventGrouping'

const DEFAULT_REFRESH_MS = 25_000

interface SourceFeed {
  venue: string
  markets: Market[]
  /** Cursor de la página siguiente; `null` = fuente agotada. */
  cursor: string | null
}

export interface UseDomainEventsState {
  events: MarketEventView[]
  isLoading: boolean
  isLoadingMore: boolean
  /** Solo cuando NINGUNA fuente pudo responder. */
  error: string | null
  /** Fuentes que fallaron mientras otras sí respondieron. */
  degradedVenues: string[]
  hasMore: boolean
  loadMore: () => void
  reload: () => void
  lastSyncAt: number | null
  isSyncing: boolean
}

function buildFilter(
  category: MarketCategory | undefined,
  subcategory: string | undefined,
  search: string,
  cursor?: string,
): MarketFilter {
  return {
    ...(category !== undefined ? { category } : {}),
    ...(subcategory !== undefined ? { subcategory } : {}),
    ...(search.trim() !== '' ? { query: search.trim() } : {}),
    ...(cursor !== undefined ? { cursor } : {}),
  }
}

/** Intercala las tarjetas de las fuentes para que todas tengan visibilidad. */
function interleave(perSource: MarketEventView[][]): MarketEventView[] {
  const merged: MarketEventView[] = []
  const longest = Math.max(0, ...perSource.map((list) => list.length))
  for (let i = 0; i < longest; i++) {
    for (const list of perSource) {
      const item = list[i]
      if (item !== undefined) merged.push(item)
    }
  }
  return merged
}

export function useDomainEvents(options: {
  category?: MarketCategory
  /** Subcategoría dentro de `category` (un deporte de 'sports', p. ej.). */
  subcategory?: string
  search?: string
  refreshMs?: number
}): UseDomainEventsState {
  const {
    category,
    subcategory,
    search = '',
    refreshMs = DEFAULT_REFRESH_MS,
  } = options

  const [feeds, setFeeds] = useState<SourceFeed[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [degradedVenues, setDegradedVenues] = useState<string[]>([])
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null)
  const [nonce, setNonce] = useState(0)

  const loadingRef = useRef(false)
  const feedsRef = useRef(feeds)
  feedsRef.current = feeds

  const fetchFirstPage = useCallback(
    async (source: MarketSource) =>
      source.listMarkets(buildFilter(category, subcategory, search)),
    [category, subcategory, search],
  )

  // Carga inicial; se repite al cambiar categoría, búsqueda o al recargar.
  useEffect(() => {
    let alive = true
    setIsLoading(true)
    setError(null)
    setDegradedVenues([])
    setFeeds([])

    Promise.all(
      marketSources.sources.map(async (source) => {
        const result = await fetchFirstPage(source)
        return { source, result }
      }),
    )
      .then((results) => {
        if (!alive) return
        const nextFeeds: SourceFeed[] = []
        const failed: string[] = []
        let firstError: string | null = null

        for (const { source, result } of results) {
          if (result.ok) {
            nextFeeds.push({
              venue: source.venue,
              markets: result.data.markets,
              cursor: result.data.nextCursor,
            })
          } else {
            failed.push(source.displayName)
            firstError ??= result.error.message
          }
        }

        setFeeds(nextFeeds)
        setLastSyncAt(Date.now())
        if (nextFeeds.length === 0) {
          setError(firstError ?? 'Ninguna fuente de mercados respondió.')
        } else {
          setDegradedVenues(failed)
        }
      })
      .finally(() => {
        if (alive) setIsLoading(false)
      })

    return () => {
      alive = false
    }
  }, [fetchFirstPage, nonce])

  const loadMore = useCallback(async () => {
    if (loadingRef.current) return
    const pending = feedsRef.current.filter((feed) => feed.cursor !== null)
    if (pending.length === 0) return

    loadingRef.current = true
    setIsLoadingMore(true)
    try {
      const results = await Promise.all(
        pending.map(async (feed) => {
          const source = marketSources.byVenue(feed.venue)
          if (source === null || feed.cursor === null) return null
          const result = await source.listMarkets(
            buildFilter(category, subcategory, search, feed.cursor),
          )
          return { venue: feed.venue, result }
        }),
      )

      setFeeds((prev) =>
        prev.map((feed) => {
          const update = results.find((r) => r?.venue === feed.venue)
          if (!update || !update.result.ok) return feed
          const seen = new Set(feed.markets.map((m) => m.id))
          return {
            ...feed,
            markets: [
              ...feed.markets,
              ...update.result.data.markets.filter((m) => !seen.has(m.id)),
            ],
            cursor: update.result.data.nextCursor,
          }
        }),
      )
      setLastSyncAt(Date.now())
    } finally {
      loadingRef.current = false
      setIsLoadingMore(false)
    }
  }, [category, subcategory, search])

  // Refresco en vivo: actualiza precios de lo ya cargado, sin reordenar.
  useEffect(() => {
    if (refreshMs <= 0) return
    let alive = true

    const sync = async () => {
      if (loadingRef.current) return
      if (typeof document !== 'undefined' && document.hidden) return

      setIsSyncing(true)
      try {
        const results = await Promise.all(
          marketSources.sources.map(async (source) => ({
            venue: source.venue,
            result: await fetchFirstPage(source),
          })),
        )
        if (!alive) return

        setFeeds((prev) =>
          prev.map((feed) => {
            const update = results.find((r) => r.venue === feed.venue)
            if (!update || !update.result.ok) return feed
            const fresh = new Map(
              update.result.data.markets.map((m) => [m.id, m]),
            )
            return {
              ...feed,
              markets: feed.markets.map((old) => fresh.get(old.id) ?? old),
            }
          }),
        )
        setLastSyncAt(Date.now())
      } catch {
        // Un fallo de refresco no rompe la vista: los datos en pantalla siguen
        // siendo válidos, solo algo más viejos. El indicador lo señala.
      } finally {
        if (alive) setIsSyncing(false)
      }
    }

    const timer = window.setInterval(sync, refreshMs)
    const onVisible = () => {
      if (!document.hidden) sync()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [fetchFirstPage, refreshMs])

  const events = useMemo(
    () => interleave(feeds.map((feed) => groupMarketsIntoEvents(feed.markets))),
    [feeds],
  )

  return {
    events,
    isLoading,
    isLoadingMore,
    error,
    degradedVenues,
    hasMore: feeds.some((feed) => feed.cursor !== null),
    loadMore,
    reload: useCallback(() => setNonce((n) => n + 1), []),
    lastSyncAt,
    isSyncing,
  }
}
