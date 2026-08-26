/**
 * Carga de EVENTOS reales de Polymarket, automática y con refresco en vivo.
 *
 * El evento es la unidad de la interfaz, igual que en la plataforma oficial:
 * trae imagen, título y sus mercados agrupados.
 *
 * Dos mecanismos, deliberadamente separados:
 *
 *  - PAGINACIÓN automática: `loadMore` lo dispara el scroll (IntersectionObserver
 *    en la vista), no un botón. Añade eventos al final.
 *  - REFRESCO en vivo: cada `refreshMs` se vuelve a pedir la primera página y se
 *    actualizan EN SITIO los precios de los eventos ya cargados. No reordena,
 *    no añade y no quita: si el listado se recolocara bajo el cursor, un clic
 *    podría acabar en un mercado distinto del que se pretendía.
 *
 * Solo lectura: no necesita wallet ni credenciales.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchEventsPage,
  searchEvents,
  GAMMA_MAX_LIMIT,
  type EventsPage,
  type RealEvent,
} from '../services/gammaApi'

/** Cada cuánto se refrescan los precios de lo ya cargado. */
const DEFAULT_REFRESH_MS = 20_000

export interface UseRealEventsState {
  events: RealEvent[]
  isLoading: boolean
  isLoadingMore: boolean
  error: string | null
  hasMore: boolean
  /** Dispara la página siguiente. La vista lo llama al llegar al final. */
  loadMore: () => void
  reload: () => void
  /** Momento del último refresco correcto, para indicarlo en la UI. */
  lastSyncAt: number | null
  isSyncing: boolean
}

export function useRealEvents(options: {
  tagSlug?: string | null
  order?: string
  refreshMs?: number
  /** Texto de búsqueda global. Si viene, sustituye al listado por categoría. */
  search?: string
}): UseRealEventsState {
  const {
    tagSlug = null,
    order = 'volume24hr',
    refreshMs = DEFAULT_REFRESH_MS,
    search = '',
  } = options

  const isSearching = search.trim().length > 0

  const [events, setEvents] = useState<RealEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nextOffset, setNextOffset] = useState<number | null>(0)
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null)
  const [nonce, setNonce] = useState(0)

  const loadingRef = useRef(false)

  /**
   * En búsqueda se pagina por `page` (1, 2, 3…) y en listado por `offset`
   * (0, 100, 200…). Se unifican tras el mismo contador: `nextOffset` guarda
   * la página en un caso y el desplazamiento en el otro.
   */
  const fetchPage = useCallback(
    (cursor: number, signal?: AbortSignal): Promise<EventsPage> =>
      isSearching
        ? searchEvents({
            query: search,
            limit: GAMMA_MAX_LIMIT,
            page: cursor === 0 ? 1 : cursor,
            signal,
          })
        : fetchEventsPage({
            tagSlug,
            order,
            limit: GAMMA_MAX_LIMIT,
            offset: cursor,
            signal,
          }),
    [isSearching, search, tagSlug, order],
  )

  // Carga inicial; se repite al cambiar categoría, orden o al recargar.
  useEffect(() => {
    const controller = new AbortController()
    let alive = true

    setIsLoading(true)
    setError(null)
    setEvents([])
    setNextOffset(0)

    fetchPage(0, controller.signal)
      .then((page) => {
        if (!alive) return
        setEvents(page.events)
        setNextOffset(page.nextOffset)
        setLastSyncAt(Date.now())
      })
      .catch((e: unknown) => {
        if (!alive) return
        if (e instanceof DOMException && e.name === 'AbortError') return
        setError(
          e instanceof Error
            ? e.message
            : 'No se pudieron cargar los eventos de Polymarket.',
        )
      })
      .finally(() => {
        if (alive) setIsLoading(false)
      })

    return () => {
      alive = false
      controller.abort()
    }
  }, [fetchPage, nonce])

  const loadMore = useCallback(async () => {
    if (nextOffset === null || loadingRef.current) return
    loadingRef.current = true
    setIsLoadingMore(true)
    try {
      const page = await fetchPage(nextOffset)
      setEvents((prev) => {
        const seen = new Set(prev.map((e) => e.id))
        return [...prev, ...page.events.filter((e) => !seen.has(e.id))]
      })
      setNextOffset(page.nextOffset)
      setLastSyncAt(Date.now())
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'No se pudieron cargar más eventos.',
      )
    } finally {
      loadingRef.current = false
      setIsLoadingMore(false)
    }
  }, [nextOffset, fetchPage])

  /**
   * Refresco en vivo. Actualiza precios y métricas de los eventos que ya están
   * en pantalla, sin tocar el orden ni la cantidad.
   */
  useEffect(() => {
    if (refreshMs <= 0) return

    let alive = true
    const controller = new AbortController()

    const sync = async () => {
      // No pisar una carga en curso ni refrescar en una pestaña oculta:
      // gastaría peticiones sin que nadie lo esté viendo.
      if (loadingRef.current) return
      if (typeof document !== 'undefined' && document.hidden) return

      setIsSyncing(true)
      try {
        const page = await fetchPage(0, controller.signal)
        if (!alive) return

        const fresh = new Map(page.events.map((e) => [e.id, e]))
        setEvents((prev) =>
          prev.map((old) => {
            const nuevo = fresh.get(old.id)
            if (!nuevo) return old
            // Se conserva la identidad y el orden previos; solo se refrescan
            // los datos que cambian con el mercado.
            return {
              ...old,
              liquidityUsd: nuevo.liquidityUsd,
              volumeUsd: nuevo.volumeUsd,
              volume24hUsd: nuevo.volume24hUsd,
              openInterestUsd: nuevo.openInterestUsd,
              commentCount: nuevo.commentCount,
              live: nuevo.live,
              markets: old.markets.map((m) => {
                const mn = nuevo.markets.find((x) => x.id === m.id)
                return mn
                  ? {
                      ...m,
                      prices: mn.prices,
                      bestBid: mn.bestBid,
                      bestAsk: mn.bestAsk,
                      spread: mn.spread,
                      lastTradePrice: mn.lastTradePrice,
                      liquidityUsd: mn.liquidityUsd,
                      volume24hUsd: mn.volume24hUsd,
                      acceptingOrders: mn.acceptingOrders,
                    }
                  : m
              }),
            }
          }),
        )
        setLastSyncAt(Date.now())
        // Un refresco correcto limpia un error de red anterior.
        setError(null)
      } catch {
        // Un fallo de refresco no debe romper la vista ni mostrar alarma:
        // los datos en pantalla siguen siendo válidos, solo algo más viejos.
      } finally {
        if (alive) setIsSyncing(false)
      }
    }

    const timer = window.setInterval(sync, refreshMs)
    // Al volver a la pestaña, sincroniza de inmediato en vez de esperar.
    const onVisible = () => {
      if (!document.hidden) sync()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      alive = false
      controller.abort()
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [fetchPage, refreshMs])

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  return {
    events,
    isLoading,
    isLoadingMore,
    error,
    hasMore: nextOffset !== null,
    loadMore,
    reload,
    lastSyncAt,
    isSyncing,
  }
}
