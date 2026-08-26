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

/**
 * Límite máximo por petición que acepta la Gamma API.
 *
 * Medido: pedir 500 devuelve 100. Pedirlo de más no da error, simplemente
 * recorta, lo que es fácil confundir con "ya no hay más resultados".
 */
export const GAMMA_MAX_LIMIT = 100

/**
 * Techo de paginación de la API: a partir de este offset responde HTTP 422.
 *
 * Medido recorriendo páginas: hay ~2.100 mercados abiertos y operables y el
 * offset 2100 ya falla.
 */
export const GAMMA_MAX_OFFSET = 2100

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

export interface MarketsPage {
  markets: RealMarket[]
  /** Cuántos devolvió la API antes de normalizar (para saber si quedan más). */
  rawCount: number
  /** Offset a pedir para la página siguiente, o null si no hay más. */
  nextOffset: number | null
}

/**
 * Trae mercados abiertos y operables, ordenados por volumen 24h.
 *
 * Pide más de los necesarios porque se descartan los que no tienen libro o
 * les falta información para operar.
 */
export async function fetchMarketsPage(
  options: FetchMarketsOptions = {},
): Promise<MarketsPage> {
  const {
    limit = GAMMA_MAX_LIMIT,
    offset = 0,
    order = 'liquidityNum',
    ascending = false,
    tagSlug,
    signal,
  } = options

  const effectiveLimit = Math.min(limit, GAMMA_MAX_LIMIT)

  const params = new URLSearchParams({
    closed: 'false',
    archived: 'false',
    active: 'true',
    // Solo mercados con libro de órdenes: sin esto no se puede operar.
    enableOrderBook: 'true',
    limit: String(effectiveLimit),
    offset: String(offset),
    order,
    ascending: String(ascending),
  })
  if (tagSlug) params.set('tag_slug', tagSlug)

  const res = await fetch(`${GAMMA_API_BASE}/markets?${params}`, { signal })
  if (!res.ok) {
    // Pasado el techo de paginación la API responde 422; se trata como fin de
    // resultados en lugar de como error.
    if (res.status === 422) {
      return { markets: [], rawCount: 0, nextOffset: null }
    }
    throw new Error(`Gamma API respondió ${res.status} ${res.statusText}`)
  }

  const data: unknown = await res.json()
  // Gamma devuelve un array directo (verificado); se admite {markets:[...]} por si cambia.
  const list: GammaMarketRaw[] = Array.isArray(data)
    ? (data as GammaMarketRaw[])
    : ((data as { markets?: GammaMarketRaw[] })?.markets ?? [])

  const markets = list
    .map(normalizeMarket)
    .filter((m): m is RealMarket => m !== null)

  // Si la API devolvió menos de lo pedido, se agotaron los resultados.
  const candidateNext = offset + effectiveLimit
  const nextOffset =
    list.length < effectiveLimit || candidateNext >= GAMMA_MAX_OFFSET
      ? null
      : candidateNext

  return { markets, rawCount: list.length, nextOffset }
}

/** Compatibilidad: una sola página, solo los mercados. */
export async function fetchMarkets(
  options: FetchMarketsOptions = {},
): Promise<RealMarket[]> {
  const page = await fetchMarketsPage(options)
  return page.markets
}

/**
 * Categorías de nivel superior, al estilo de la navegación de Polymarket.
 *
 * Cada slug está VERIFICADO contra la API: devuelve eventos reales con
 * mercados operables. Se probaron 40 candidatos y varios que parecen obvios no
 * existen (`entertainment`, `financials`, `companies` devuelven 0 eventos), por
 * eso la lista es esta y no la que uno supondría.
 *
 * IMPORTANTE: el filtro por etiqueta solo funciona en `/events`. En `/markets`
 * el parámetro `tag_slug` se IGNORA silenciosamente: pedir `politics`, `sports`
 * o un slug inventado devuelve exactamente los mismos IDs. Construir pestañas
 * sobre `/markets?tag_slug=` daría una UI que parece funcionar mostrando
 * siempre lo mismo.
 */
export const CATEGORIES = [
  { slug: null, label: 'Tendencia' },
  { slug: 'politics', label: 'Política' },
  { slug: 'sports', label: 'Deportes' },
  { slug: 'crypto', label: 'Cripto' },
  { slug: 'geopolitics', label: 'Geopolítica' },
  { slug: 'economy', label: 'Economía' },
  { slug: 'tech', label: 'Tecnología' },
  { slug: 'pop-culture', label: 'Cultura' },
  { slug: 'elections', label: 'Elecciones' },
] as const

export type CategorySlug = (typeof CATEGORIES)[number]['slug']

interface GammaEventRaw {
  id: string
  title?: string
  ticker?: string
  markets?: GammaMarketRaw[]
  tags?: { slug?: string }[]
}

/**
 * Trae los mercados de una categoría a través de `/events`.
 *
 * Un evento agrupa varios mercados (p.ej. "Nominado demócrata 2028" contiene
 * un mercado por candidato), así que se aplanan. Se filtran los que no tienen
 * libro o no aceptan órdenes: en modo real no sirven para nada.
 */
export async function fetchMarketsByTag(options: {
  tagSlug: string
  /** Nº de EVENTOS a pedir (cada uno aporta varios mercados). Máx 100. */
  eventLimit?: number
  offset?: number
  signal?: AbortSignal
}): Promise<MarketsPage> {
  const { tagSlug, eventLimit = 60, offset = 0, signal } = options

  const params = new URLSearchParams({
    closed: 'false',
    archived: 'false',
    active: 'true',
    limit: String(Math.min(eventLimit, GAMMA_MAX_LIMIT)),
    offset: String(offset),
    // En /events el campo de orden es `liquidity`, no `liquidityNum`.
    order: 'liquidity',
    ascending: 'false',
    tag_slug: tagSlug,
  })

  const res = await fetch(`${GAMMA_API_BASE}/events?${params}`, { signal })
  if (!res.ok) {
    if (res.status === 422) return { markets: [], rawCount: 0, nextOffset: null }
    throw new Error(`Gamma API respondió ${res.status} ${res.statusText}`)
  }

  const data: unknown = await res.json()
  const events: GammaEventRaw[] = Array.isArray(data) ? data : []

  const markets: RealMarket[] = []
  for (const ev of events) {
    for (const raw of ev.markets ?? []) {
      if (raw.enableOrderBook !== true) continue
      if (raw.acceptingOrders !== true) continue
      const norm = normalizeMarket(raw)
      if (!norm) continue
      // El título del evento da contexto a la tarjeta ("Nominado demócrata
      // 2028" sobre "¿Ganará Newsom?").
      markets.push({ ...norm, eventTitle: norm.eventTitle ?? ev.title })
    }
  }

  // Los mercados de un mismo evento vienen en orden arbitrario.
  markets.sort((a, b) => b.liquidityUsd - a.liquidityUsd)

  const effective = Math.min(eventLimit, GAMMA_MAX_LIMIT)
  const nextOffset =
    events.length < effective || offset + effective >= GAMMA_MAX_OFFSET
      ? null
      : offset + effective

  return { markets, rawCount: events.length, nextOffset }
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
