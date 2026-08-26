/**
 * Carga de mercados reales de Polymarket con liquidez real.
 *
 * Solo lectura: no necesita wallet ni credenciales. Se puede ver el mercado
 * antes de conectar nada.
 */

import { useCallback, useEffect, useState } from 'react'
import { fetchMarkets, type RealMarket } from '../services/gammaApi'
import {
  fetchOrderBook,
  simulateMarketFill,
  type OrderBook,
} from '../services/clobApi'

export interface UseRealMarketsState {
  markets: RealMarket[]
  isLoading: boolean
  error: string | null
  reload: () => void
}

export function useRealMarkets(limit = 40): UseRealMarketsState {
  const [markets, setMarkets] = useState<RealMarket[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    let alive = true

    setIsLoading(true)
    setError(null)

    fetchMarkets({ limit, signal: controller.signal })
      .then((list) => {
        if (!alive) return
        setMarkets(list)
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
  }, [limit, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  return { markets, isLoading, error, reload }
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
