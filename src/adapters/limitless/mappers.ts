/**
 * Mapeo de las formas crudas de Limitless (ya validadas) al dominio.
 * Funciones puras: sin red, sin reloj, sin estado.
 */
import { formatUnits } from 'viem'
import {
  makeMarketId,
  priceToProbability,
  toDecimal,
  type DecimalString,
  type Market,
  type MarketCategory,
  type MarketStatus,
  type Outcome,
  type Position,
  type VenueId,
} from '../../domain/types.ts'
import type {
  RawClobPosition,
  RawLimitlessGroup,
  RawLimitlessMarket,
  RawPositionSide,
} from './validate.ts'

/**
 * Limitless liquida todo en USDC (6 decimales). El colateral concreto viaja
 * en cada mercado; esta constante solo se usa donde la API no lo repite
 * (posiciones de cartera).
 */
export const USDC_DECIMALS = 6

// --- Estados -------------------------------------------------------------------

/**
 * Estados documentados: FUNDED, FUNDED_FLAGGED (vivo pero marcado), LOCKED
 * (pausado), RESOLVED, DRAFT (aún sin abrir). Lo desconocido degrada a
 * 'suspended': ni se lista por defecto ni cotiza, pero no rompe el catálogo.
 */
export function mapStatus(
  status: string,
  expired: boolean,
  hidden: boolean,
): MarketStatus {
  switch (status) {
    case 'RESOLVED':
      return 'resolved'
    case 'LOCKED':
      return 'suspended'
    case 'FUNDED':
    case 'FUNDED_FLAGGED':
      if (hidden) return 'suspended'
      return expired ? 'closed' : 'open'
    case 'DRAFT':
    default:
      return 'suspended'
  }
}

// --- Categorías ----------------------------------------------------------------

/**
 * La propiedad `domain` de Limitless → taxonomía del dominio. Lo que no
 * encaja cae en 'other' en lugar de inventar categorías.
 */
const DOMAIN_TO_CATEGORY: Record<string, MarketCategory> = {
  crypto: 'crypto',
  finance: 'economy',
  economy: 'economy',
  sport: 'sports',
  sports: 'sports',
  esports: 'sports',
  politics: 'politics',
  tech: 'tech',
  technology: 'tech',
  culture: 'culture',
  entertainment: 'culture',
  weather: 'weather',
}

function propertyValues(
  properties: { key: string; values: string[] }[],
  key: string,
): string[] {
  return properties.find((p) => p.key === key)?.values ?? []
}

export function mapCategory(
  properties: { key: string; values: string[] }[],
): MarketCategory {
  for (const domain of propertyValues(properties, 'domain')) {
    const category = DOMAIN_TO_CATEGORY[domain.toLowerCase()]
    if (category !== undefined) return category
  }
  return 'other'
}

// --- Mercado --------------------------------------------------------------------

/** `toDecimal` que no lanza: un dato corrupto se convierte en `null`. */
function safeDecimal(value: string): DecimalString | null {
  try {
    return toDecimal(value)
  } catch {
    return null
  }
}

/** Precio 0..1 del venue → DecimalString, o `null` si no es representable. */
function priceDecimalOf(price: number): DecimalString | null {
  if (!Number.isFinite(price) || price < 0 || price > 1) return null
  // toFixed evita la notación científica de números tipo 1e-7.
  return safeDecimal(price.toFixed(6).replace(/0+$/, '').replace(/\.$/, ''))
}

export interface MappedGroupInfo {
  id: string
  label: string
  imageUrl: string | null
}

/**
 * Un mercado de Limitless → `Market` del dominio, o `null` si el mercado no
 * es representable como binario CLOB (los AMM heredados usan otra escala de
 * precios y otro mecanismo de ejecución; quedan fuera del alcance de esta
 * fase y el llamante cuenta los descartes).
 */
export function mapMarketToDomain(
  raw: RawLimitlessMarket,
  venue: VenueId,
  chainId: number,
  group: MappedGroupInfo | null = null,
): Market | null {
  if (raw.tradeType !== 'clob') return null
  if (raw.prices.length < 2) return null

  const status = mapStatus(raw.status, raw.expired, raw.hidden)
  const isResolved = status === 'resolved'
  // Ojo: la doc dice que las resoluciones con ganador único dejan
  // `payoutNumerators` en null, pero la API real lo puebla ([0, 1]). El
  // discriminador fiable es `winningOutcomeIndex`: índice → ganador único;
  // null con numeradores → reparto (split).
  const singleWinner = isResolved && raw.winningOutcomeIndex !== null
  // En los mercados recurrentes de precio, YES es "Up" y NO es "Down".
  const labels = raw.hasOpenPrice ? ['Up', 'Down'] : ['Yes', 'No']

  const outcomes: Outcome[] = (['yes', 'no'] as const).map((side, index) => {
    const price = priceDecimalOf(raw.prices[index])
    const probability = priceToProbability(price, 'probability')
    // Cotizable solo con el mercado abierto y un precio real en (0, 1). En un
    // mercado resuelto los precios degeneran a [0, 1] o [1, 0]: eso NO es una
    // cotización y jamás debe renderizarse como 0% o 100% operables.
    const isQuotable = status === 'open' && probability !== null

    return {
      id: side,
      label: labels[index],
      probability: isQuotable ? probability : null,
      price: isQuotable ? price : null,
      isQuotable,
      ...(singleWinner ? { isWinner: raw.winningOutcomeIndex === index } : {}),
    }
  })

  const title = raw.proxyTitle ?? raw.title
  const subcategory =
    propertyValues(raw.properties, 'sport-type')[0] ??
    propertyValues(raw.properties, 'ticker')[0]

  return {
    id: makeMarketId(venue, raw.slug),
    venue,
    chainId,
    question: group !== null ? `${group.label} · ${title}` : title,
    category: mapCategory(raw.properties),
    ...(subcategory !== undefined ? { subcategory } : {}),
    outcomes,
    status,
    closesAt:
      raw.expirationTimestamp !== null ? new Date(raw.expirationTimestamp) : null,
    // El CLOB no publica liquidez agregada por mercado, y el volumen de la
    // API es histórico total, no de 24h. Antes que mentir: null.
    liquidityUsd: null,
    volume24hUsd: null,
    isQuotable: status === 'open' && outcomes.some((o) => o.isQuotable),
    priceFormat: 'probability',
    ...(group !== null
      ? {
          group: {
            id: group.id,
            label: group.label,
            ...(group.imageUrl !== null ? { imageUrl: group.imageUrl } : {}),
          },
        }
      : {}),
    ...(raw.imageUrl !== null ? { imageUrl: raw.imageUrl } : {}),
    raw,
  }
}

/** Los submercados de un grupo negRisk, cada uno como `Market` del dominio. */
export function mapGroupToDomain(
  group: RawLimitlessGroup,
  venue: VenueId,
  chainId: number,
): Market[] {
  const info: MappedGroupInfo = {
    id: group.slug,
    label: group.title,
    imageUrl: group.imageUrl,
  }
  const markets: Market[] = []
  for (const sub of group.markets) {
    const market = mapMarketToDomain(sub, venue, chainId, info)
    if (market !== null) markets.push(market)
  }
  return markets
}

// --- Posiciones ------------------------------------------------------------------

function formatRaw(raw: string): DecimalString | null {
  try {
    return safeDecimal(formatUnits(BigInt(raw), USDC_DECIMALS))
  } catch {
    return null
  }
}

/** Acciones de la posición: balance si la API lo da; si no, coste ÷ precio medio. */
function sharesRawOf(side: RawPositionSide): bigint | null {
  if (side.balanceRaw !== null) return BigInt(side.balanceRaw)
  const fillPrice = BigInt(side.fillPriceRaw)
  if (fillPrice === 0n) return null
  return (BigInt(side.costRaw) * 10n ** BigInt(USDC_DECIMALS)) / fillPrice
}

/**
 * Una posición CLOB de la API → hasta dos posiciones del dominio (lados YES y
 * NO con coste). El endpoint no informa de la fecha de apertura: `openedAt`
 * queda en null (ver [DESVIACIÓN 8] del dominio).
 */
export function mapClobPositionToDomain(
  raw: RawClobPosition,
  venue: VenueId,
): Position[] {
  const positions: Position[] = []
  const resolved = raw.market.status === 'RESOLVED'
  // Mismo discriminador que en el mapeo de mercados: la API puebla
  // `payoutNumerators` incluso con ganador único, así que un split es
  // SOLO `winningOutcomeIndex: null` con numeradores presentes.
  const split =
    resolved &&
    raw.market.winningOutcomeIndex === null &&
    raw.market.payoutNumerators !== null

  for (const [index, side] of (['yes', 'no'] as const).entries()) {
    const data = raw[side]
    if (BigInt(data.costRaw) === 0n) continue

    const stake = formatRaw(data.costRaw)
    const currentValue = formatRaw(data.marketValueRaw)
    const sharesRaw = sharesRawOf(data)
    if (stake === null || sharesRaw === null) continue
    const potentialPayout = safeDecimal(formatUnits(sharesRaw, USDC_DECIMALS))
    if (potentialPayout === null) continue

    let status: Position['status'] = 'open'
    if (resolved) {
      if (split || raw.market.winningOutcomeIndex === index) status = 'redeemable'
      else status = 'lost'
    }

    positions.push({
      id: `${raw.market.slug}:${side}`,
      marketId: makeMarketId(venue, raw.market.slug),
      outcomeId: side,
      marketQuestion: raw.market.title ?? raw.market.slug,
      outcomeLabel: side === 'yes' ? 'Yes' : 'No',
      stake,
      potentialPayout,
      currentValue,
      status,
      openedAt: null,
    })
  }
  return positions
}
