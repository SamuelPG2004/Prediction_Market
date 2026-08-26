/**
 * Cliente de la Gamma API de Polymarket (datos de mercados, solo lectura).
 *
 * Forma de la respuesta verificada contra la API real el 2026-08-26.
 *
 * Trampa importante: `outcomes`, `outcomePrices` y `clobTokenIds` NO llegan como
 * arrays. Llegan como **strings que contienen JSON**:
 *
 *   "clobTokenIds": "[\"271469...\", \"332166...\"]"
 *   "outcomePrices": "[\"0.006\", \"0.994\"]"
 *
 * El código anterior de este proyecto los tipaba como `number[]` y accedía a
 * `outcomePrices[0]`, lo que devolvía un carácter suelto (`"["`). Aquí se
 * parsean explícitamente.
 */

import { GAMMA_API_BASE } from '../config/polymarket'

/** Mercado tal como lo devuelve Gamma, con los campos que usamos. */
export interface GammaMarketRaw {
  id: string
  question: string
  slug?: string
  description?: string
  conditionId?: string
  questionID?: string
  /** JSON string, p.ej. '["Yes","No"]' */
  outcomes?: string
  /** JSON string, p.ej. '["0.53","0.47"]' */
  outcomePrices?: string
  /** JSON string con los token IDs del CLOB, en el mismo orden que outcomes */
  clobTokenIds?: string
  liquidityNum?: number
  volumeNum?: number
  volume24hr?: number
  liquidity?: string
  volume?: string
  active?: boolean
  closed?: boolean
  archived?: boolean
  /** Si el CLOB acepta órdenes ahora mismo. */
  acceptingOrders?: boolean
  enableOrderBook?: boolean
  /** Mercado de riesgo negativo: usa otro exchange y otro contrato de shares. */
  negRisk?: boolean
  endDate?: string
  endDateIso?: string
  image?: string
  icon?: string
  resolutionSource?: string
  /** Restricciones de orden que impone el CLOB. */
  orderPriceMinTickSize?: number
  orderMinSize?: number
  bestBid?: number
  bestAsk?: number
  spread?: number
  lastTradePrice?: number
  oneWeekPriceChange?: number
  events?: { title?: string; ticker?: string }[]
}

/** Mercado normalizado y listo para usar en la app. */
export interface RealMarket {
  id: string
  question: string
  description: string
  slug?: string
  conditionId: string
  /** ["Yes","No"] normalmente. */
  outcomes: string[]
  /** Token IDs del CLOB, alineados con `outcomes`. */
  clobTokenIds: string[]
  /** Precios por resultado, 0..1, alineados con `outcomes`. */
  prices: number[]
  liquidityUsd: number
  volumeUsd: number
  volume24hUsd: number
  endDate?: string
  negRisk: boolean
  acceptingOrders: boolean
  icon?: string
  resolutionSource?: string
  minTickSize: number
  minOrderSize: number
  bestBid?: number
  bestAsk?: number
  spread?: number
  lastTradePrice?: number
  eventTitle?: string
}

/**
 * Parsea un campo que puede venir como array o como string con JSON dentro.
 * Devuelve [] si no se puede interpretar, en lugar de lanzar.
 */
function parseJsonArrayField(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value !== 'string' || value.trim() === '') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

function toNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'string' ? parseFloat(value) : Number(value)
  return Number.isFinite(n) ? n : fallback
}

/**
 * Normaliza un mercado de Gamma. Devuelve null si le falta lo imprescindible
 * para poder operar (token IDs o conditionId), en vez de dejar pasar un
 * mercado a medias que reventaría al firmar una orden.
 */
export function normalizeMarket(raw: GammaMarketRaw): RealMarket | null {
  const clobTokenIds = parseJsonArrayField(raw.clobTokenIds)
  const outcomes = parseJsonArrayField(raw.outcomes)
  const priceStrings = parseJsonArrayField(raw.outcomePrices)

  if (!raw.conditionId) return null
  if (clobTokenIds.length < 2) return null
  if (outcomes.length !== clobTokenIds.length) return null

  const prices = clobTokenIds.map((_, i) => toNumber(priceStrings[i], 0.5))

  return {
    id: raw.id,
    question: raw.question,
    description: raw.description ?? '',
    slug: raw.slug,
    conditionId: raw.conditionId,
    outcomes,
    clobTokenIds,
    prices,
    liquidityUsd: toNumber(raw.liquidityNum ?? raw.liquidity),
    volumeUsd: toNumber(raw.volumeNum ?? raw.volume),
    volume24hUsd: toNumber(raw.volume24hr),
    endDate: raw.endDateIso ?? raw.endDate,
    negRisk: raw.negRisk === true,
    acceptingOrders: raw.acceptingOrders === true,
    icon: raw.icon ?? raw.image,
    resolutionSource: raw.resolutionSource || undefined,
    // Valores por defecto conservadores si Gamma no los trae.
    minTickSize: toNumber(raw.orderPriceMinTickSize, 0.001),
    minOrderSize: toNumber(raw.orderMinSize, 5),
    bestBid: raw.bestBid,
    bestAsk: raw.bestAsk,
    spread: raw.spread,
    lastTradePrice: raw.lastTradePrice,
    eventTitle: raw.events?.[0]?.title,
  }
}

export interface FetchMarketsOptions {
  limit?: number
  offset?: number
  /** Ordena por este campo (p.ej. 'volume24hr', 'liquidityNum'). */
  order?: string
  ascending?: boolean
  /** Filtra por slug de etiqueta (p.ej. 'crypto', 'politics'). */
  tagSlug?: string
  signal?: AbortSignal
}

/**
 * Trae mercados abiertos y operables, ordenados por volumen 24h.
 *
 * Pide más de los necesarios porque se descartan los que no tienen libro o
 * les falta información para operar.
 */
export async function fetchMarkets(
  options: FetchMarketsOptions = {},
): Promise<RealMarket[]> {
  const {
    limit = 40,
    offset = 0,
    order = 'volume24hr',
    ascending = false,
    tagSlug,
    signal,
  } = options

  const params = new URLSearchParams({
    closed: 'false',
    archived: 'false',
    active: 'true',
    // Solo mercados con libro de órdenes: sin esto no se puede operar.
    enableOrderBook: 'true',
    limit: String(limit),
    offset: String(offset),
    order,
    ascending: String(ascending),
  })
  if (tagSlug) params.set('tag_slug', tagSlug)

  const res = await fetch(`${GAMMA_API_BASE}/markets?${params}`, { signal })
  if (!res.ok) {
    throw new Error(`Gamma API respondió ${res.status} ${res.statusText}`)
  }

  const data: unknown = await res.json()
  // Gamma devuelve un array directo (verificado); se admite {markets:[...]} por si cambia.
  const list: GammaMarketRaw[] = Array.isArray(data)
    ? (data as GammaMarketRaw[])
    : ((data as { markets?: GammaMarketRaw[] })?.markets ?? [])

  return list
    .map(normalizeMarket)
    .filter((m): m is RealMarket => m !== null)
}

/** Trae un mercado por su conditionId. */
export async function fetchMarketByConditionId(
  conditionId: string,
  signal?: AbortSignal,
): Promise<RealMarket | null> {
  const res = await fetch(
    `${GAMMA_API_BASE}/markets?condition_ids=${conditionId}`,
    { signal },
  )
  if (!res.ok) return null
  const data: unknown = await res.json()
  const list: GammaMarketRaw[] = Array.isArray(data) ? data : []
  const first = list[0]
  return first ? normalizeMarket(first) : null
}
