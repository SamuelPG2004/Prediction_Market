/**
 * Carga de mercados reales de Polymarket con liquidez real.
 *
 * Solo lectura: no necesita wallet ni credenciales. Se puede ver el mercado
 * antes de conectar nada.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchMarketsByTag,
  fetchMarketsPage,
  GAMMA_MAX_LIMIT,
  type CategorySlug,
  type MarketsPage,
  type RealMarket,
} from '../services/gammaApi'
import {
  fetchOrderBook,
  simulateMarketFill,
  type OrderBook,
} from '../services/clobApi'

/** Criterios de ordenación que expone la Gamma API y nos resultan útiles. */
export type MarketSort = 'liquidityNum' | 'volume24hr' | 'volumeNum'

export interface UseRealMarketsState {
  markets: RealMarket[]
  isLoading: boolean
  /** Cargando una página adicional (no la primera). */
  isLoadingMore: boolean
  error: string | null
  /** Quedan más páginas por traer. */
  hasMore: boolean
  loadMore: () => void
  /** Trae TODAS las páginas restantes de golpe. */
  loadAll: () => void
  reload: () => void
  sort: MarketSort
  setSort: (s: MarketSort) => void
}

/**
 * Mercados reales de Polymarket, paginados.
 *
 * Hay ~2.100 mercados abiertos y operables, y la API sirve como máximo 100 por
 * petición. Se carga la primera página rápido y el resto a demanda, en lugar de
 * bloquear el primer render con 21 peticiones.
 *
 * Ordena por liquidez descendente por defecto: para operar de verdad, un
 * mercado sin libro no sirve, así que los más líquidos van primero.
 */
export function useRealMarkets(
  category: CategorySlug = null,
): UseRealMarketsState {
  const [markets, setMarkets] = useState<RealMarket[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nextOffset, setNextOffset] = useState<number | null>(0)
  // "Tendencia" ordena por actividad reciente, no por liquidez: es lo que
  // significa la palabra. Ordenando por liquidez la pestaña acabaría siendo un
  // duplicado de Política, que es la categoría con más capital parado.
  const [sort, setSort] = useState<MarketSort>('volume24hr')
  const [nonce, setNonce] = useState(0)

  // Evita que una carga en curso pise a otra (p.ej. cambio de orden mientras
  // se está trayendo una página).
  const loadingRef = useRef(false)

  /**
   * Elige la fuente según la categoría.
   *
   * Sin categoría se usa `/markets`, que ordena bien y da el catálogo completo.
   * Con categoría hay que ir por `/events`, porque `/markets?tag_slug=` se
   * ignora silenciosamente y devolvería lo mismo para todas las pestañas.
   */
  const fetchPage = useCallback(
    (offset: number, signal?: AbortSignal): Promise<MarketsPage> =>
      category
        ? fetchMarketsByTag({ tagSlug: category, offset, signal })
        : fetchMarketsPage({
            limit: GAMMA_MAX_LIMIT,
            offset,
            order: sort,
            signal,
          }),
    [category, sort],
  )

  // Primera página; recarga al cambiar categoría u orden.
  useEffect(() => {
    const controller = new AbortController()
    let alive = true

    setIsLoading(true)
    setError(null)
    setMarkets([])
    setNextOffset(0)

    fetchPage(0, controller.signal)
      .then((page) => {
        if (!alive) return
        setMarkets(page.markets)
        setNextOffset(page.nextOffset)
      })
      .catch((e: unknown) => {
        if (!alive) return
        if (e instanceof DOMException && e.name === 'AbortError') return
        setError(
          e instanceof Error
            ? e.message
            : 'No se pudieron cargar los mercados de Polymarket.',
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

  /** Deduplica por id: la paginación puede solapar si el orden cambia en vuelo. */
  const append = useCallback((incoming: RealMarket[]) => {
    setMarkets((prev) => {
      const seen = new Set(prev.map((m) => m.id))
      return [...prev, ...incoming.filter((m) => !seen.has(m.id))]
    })
  }, [])

  const loadMore = useCallback(async () => {
    if (nextOffset === null || loadingRef.current) return
    loadingRef.current = true
    setIsLoadingMore(true)
    try {
      const page = await fetchPage(nextOffset)
      append(page.markets)
      setNextOffset(page.nextOffset)
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'No se pudo cargar más mercados.',
      )
    } finally {
      loadingRef.current = false
      setIsLoadingMore(false)
    }
  }, [nextOffset, fetchPage, append])

  const loadAll = useCallback(async () => {
    if (loadingRef.current) return
    loadingRef.current = true
    setIsLoadingMore(true)
    let offset = nextOffset
    try {
      // Secuencial a propósito: en paralelo se dispara el rate limit.
      while (offset !== null) {
        const page = await fetchPage(offset)
        append(page.markets)
        offset = page.nextOffset
        setNextOffset(offset)
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'No se pudo cargar más mercados.',
      )
    } finally {
      loadingRef.current = false
      setIsLoadingMore(false)
    }
  }, [nextOffset, fetchPage, append])

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  return {
    markets,
    isLoading,
    isLoadingMore,
    error,
    hasMore: nextOffset !== null,
    loadMore,
    loadAll,
    reload,
    sort,
    setSort,
  }
}

export interface QuoteState {
  book: OrderBook | null
  isLoading: boolean
  error: string | null
}

/**
 * Libro de órdenes de un token, con refresco periódico.
 *
 * Se refresca cada 8 s: los precios de un mercado con liquidez cambian, y
 * enseñar un precio rancio antes de firmar una orden es engañoso.
 */
export function useOrderBook(tokenId: string | null, intervalMs = 8_000) {
  const [state, setState] = useState<QuoteState>({
    book: null,
    isLoading: false,
    error: null,
  })

  useEffect(() => {
    if (!tokenId) {
      setState({ book: null, isLoading: false, error: null })
      return
    }

    let alive = true
    const controller = new AbortController()

    const load = async () => {
      try {
        const book = await fetchOrderBook(tokenId, controller.signal)
        if (alive) setState({ book, isLoading: false, error: null })
      } catch (e) {
        if (!alive) return
        if (e instanceof DOMException && e.name === 'AbortError') return
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: e instanceof Error ? e.message : 'Error al leer el libro.',
        }))
      }
    }

    setState((prev) => ({ ...prev, isLoading: true }))
    load()
    const timer = window.setInterval(load, intervalMs)

    return () => {
      alive = false
      controller.abort()
      window.clearInterval(timer)
    }
  }, [tokenId, intervalMs])

  return state
}

/** Reexporta el simulador para que la UI calcule el llenado sin importar de servicios. */
export { simulateMarketFill }
