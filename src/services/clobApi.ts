/**
 * Lecturas públicas del CLOB de Polymarket. No requieren autenticación.
 *
 * Endpoints verificados contra la API real el 2026-08-26:
 *   GET /book?token_id=...            -> { bids: [{price,size}], asks: [...] }
 *   GET /price?token_id=...&side=buy  -> { price: "0.005" }
 *   GET /midpoint?token_id=...        -> { mid: "0.006" }
 *   GET /tick-size?token_id=...       -> { minimum_tick_size: 0.001 }
 *
 * Los endpoints que usaba el código anterior (`/orderbook/{id}` y
 * `/prices/{id}`) devuelven 404: no existen.
 */

import { CLOB_API_BASE } from '../config/polymarket'

export interface BookLevel {
  price: number
  size: number
}

export interface OrderBook {
  tokenId: string
  /** Ordenados de mejor a peor (precio descendente). */
  bids: BookLevel[]
  /** Ordenados de mejor a peor (precio ascendente). */
  asks: BookLevel[]
  bestBid?: number
  bestAsk?: number
  /** Profundidad total en USD disponible en cada lado. */
  bidDepthUsd: number
  askDepthUsd: number
}

interface RawBook {
  bids?: { price: string; size: string }[]
  asks?: { price: string; size: string }[]
}

/**
 * Trae y normaliza el libro de órdenes.
 *
 * Ojo con el orden: la API devuelve los bids ASCENDENTES y los asks
 * DESCENDENTES, es decir el mejor precio de cada lado está al FINAL del array.
 * Aquí se reordena para que el mejor quede primero, que es lo que espera
 * cualquiera que lea `bids[0]`.
 */
export async function fetchOrderBook(
  tokenId: string,
  signal?: AbortSignal,
): Promise<OrderBook> {
  const res = await fetch(`${CLOB_API_BASE}/book?token_id=${tokenId}`, { signal })
  if (!res.ok) {
    throw new Error(`CLOB /book respondió ${res.status} ${res.statusText}`)
  }
  const raw: RawBook = await res.json()

  const bids = (raw.bids ?? [])
    .map((l) => ({ price: parseFloat(l.price), size: parseFloat(l.size) }))
    .filter((l) => Number.isFinite(l.price) && Number.isFinite(l.size))
    .sort((a, b) => b.price - a.price) // mejor bid = más alto, primero

  const asks = (raw.asks ?? [])
    .map((l) => ({ price: parseFloat(l.price), size: parseFloat(l.size) }))
    .filter((l) => Number.isFinite(l.price) && Number.isFinite(l.size))
    .sort((a, b) => a.price - b.price) // mejor ask = más bajo, primero

  return {
    tokenId,
    bids,
    asks,
    bestBid: bids[0]?.price,
    bestAsk: asks[0]?.price,
    bidDepthUsd: bids.reduce((acc, l) => acc + l.price * l.size, 0),
    askDepthUsd: asks.reduce((acc, l) => acc + l.price * l.size, 0),
  }
}

/** Precio de mercado para un lado concreto. */
export async function fetchPrice(
  tokenId: string,
  side: 'buy' | 'sell',
  signal?: AbortSignal,
): Promise<number | null> {
  const res = await fetch(
    `${CLOB_API_BASE}/price?token_id=${tokenId}&side=${side}`,
    { signal },
  )
  if (!res.ok) return null
  const json: { price?: string } = await res.json()
  const n = parseFloat(json.price ?? '')
  return Number.isFinite(n) ? n : null
}

/** Punto medio entre mejor bid y mejor ask. */
export async function fetchMidpoint(
  tokenId: string,
  signal?: AbortSignal,
): Promise<number | null> {
  const res = await fetch(`${CLOB_API_BASE}/midpoint?token_id=${tokenId}`, {
    signal,
  })
  if (!res.ok) return null
  const json: { mid?: string } = await res.json()
  const n = parseFloat(json.mid ?? '')
  return Number.isFinite(n) ? n : null
}

/** Tick mínimo de precio que acepta el CLOB para este token. */
export async function fetchTickSize(
  tokenId: string,
  signal?: AbortSignal,
): Promise<number> {
  const res = await fetch(`${CLOB_API_BASE}/tick-size?token_id=${tokenId}`, {
    signal,
  })
  if (!res.ok) return 0.001
  const json: { minimum_tick_size?: number } = await res.json()
  return typeof json.minimum_tick_size === 'number'
    ? json.minimum_tick_size
    : 0.001
}

/**
 * Recorre el libro para estimar el llenado real de una orden de mercado.
 *
 * Devuelve el precio medio ponderado, no el mejor precio: una orden grande
 * consume varios niveles y paga peor. Esto es lo que evita que la UI prometa
 * un precio que el mercado no va a dar.
 */
export function simulateMarketFill(
  book: OrderBook,
  side: 'buy' | 'sell',
  /** En BUY es dinero (USD); en SELL es número de shares. */
  amount: number,
): {
  /** Shares que se obtienen (BUY) o se venden (SELL). */
  shares: number
  /** Dinero gastado (BUY) o recibido (SELL). */
  usd: number
  avgPrice: number
  /** Peor precio tocado en el recorrido. */
  worstPrice: number
  /** true si el libro no tiene profundidad para todo el importe. */
  partial: boolean
} {
  const levels = side === 'buy' ? book.asks : book.bids
  let remaining = amount
  let shares = 0
  let usd = 0
  let worstPrice = 0

  for (const level of levels) {
    if (remaining <= 1e-9) break

    if (side === 'buy') {
      // remaining está en USD
      const levelCostUsd = level.price * level.size
      const spend = Math.min(remaining, levelCostUsd)
      const got = spend / level.price
      shares += got
      usd += spend
      remaining -= spend
    } else {
      // remaining está en shares
      const sell = Math.min(remaining, level.size)
      shares += sell
      usd += sell * level.price
      remaining -= sell
    }
    worstPrice = level.price
  }

  return {
    shares,
    usd,
    avgPrice: shares > 0 ? usd / shares : 0,
    worstPrice,
    partial: remaining > 1e-6,
  }
}

/** Redondea un precio al tick permitido, hacia el lado seguro para el usuario. */
export function roundToTick(
  price: number,
  tickSize: number,
  side: 'buy' | 'sell',
): number {
  if (!(tickSize > 0)) return price
  // Comprar: redondea hacia arriba (paga un poco más, pero la orden entra).
  // Vender: redondea hacia abajo (recibe un poco menos, pero la orden entra).
  const ticks = side === 'buy' ? Math.ceil(price / tickSize) : Math.floor(price / tickSize)
  const rounded = ticks * tickSize
  // Corrige el error de coma flotante que deja 0.30000000000000004
  const decimals = Math.max(0, Math.ceil(-Math.log10(tickSize)))
  return Number(rounded.toFixed(decimals))
}
