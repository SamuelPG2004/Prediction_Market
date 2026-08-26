/**
 * Carga de EVENTOS reales de Polymarket.
 *
 * El evento es la unidad de la interfaz, igual que en la plataforma oficial:
 * trae imagen, título y sus mercados agrupados. Antes se listaban mercados
 * sueltos, que llegan sin imagen y sin el contexto del evento que los agrupa.
 *
 * Solo lectura: no necesita wallet ni credenciales.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchEventsPage,
  GAMMA_MAX_LIMIT,
  type EventsPage,
  type RealEvent,
} from '../services/gammaApi'

export interface UseRealEventsState {
  events: RealEvent[]
  isLoading: boolean
  isLoadingMore: boolean
  error: string | null
  hasMore: boolean
  loadMore: () => void
  reload: () => void
}

export function useRealEvents(options: {
  tagSlug?: string | null
  order?: string
}): UseRealEventsState {
  const { tagSlug = null, order = 'volume24hr' } = options

  const [events, setEvents] = useState<RealEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nextOffset, setNextOffset] = useState<number | null>(0)
  const [nonce, setNonce] = useState(0)

  const loadingRef = useRef(false)

  const fetchPage = useCallback(
    (offset: number, signal?: AbortSignal): Promise<EventsPage> =>
      fetchEventsPage({
        tagSlug,
        order,
        limit: GAMMA_MAX_LIMIT,
        offset,
        signal,
      }),
    [tagSlug, order],
  )

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
      // Deduplica por id: el orden puede variar entre peticiones.
      setEvents((prev) => {
        const seen = new Set(prev.map((e) => e.id))
        return [...prev, ...page.events.filter((e) => !seen.has(e.id))]
      })
      setNextOffset(page.nextOffset)
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'No se pudieron cargar más eventos.',
      )
    } finally {
      loadingRef.current = false
      setIsLoadingMore(false)
    }
  }, [nextOffset, fetchPage])

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  return {
    events,
    isLoading,
    isLoadingMore,
    error,
    hasMore: nextOffset !== null,
    loadMore,
    reload,
  }
}
