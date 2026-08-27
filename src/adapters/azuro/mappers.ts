/**
 * Mapeo de las formas crudas de Azuro (ya validadas) al dominio.
 *
 * Funciones puras: sin red, sin reloj, sin estado. Son la unidad que cubren
 * los tests con fixtures.
 */
import { getMarketName, getSelectionName } from '@azuro-org/dictionaries'
import {
  makeMarketId,
  priceToProbability,
  toDecimal,
  type DecimalString,
  type Market,
  type MarketStatus,
  type Outcome,
  type Position,
  type VenueId,
} from '../../domain/types.ts'
import type {
  RawBetOrder,
  RawCondition,
  RawGame,
  RawOutcome,
} from './validate.ts'

// --- Estados ----------------------------------------------------------------

/**
 * Matriz de estados juego × condición → estado del dominio.
 *
 * Un estado DESCONOCIDO (valor nuevo del servidor) degrada a 'suspended':
 * el mercado ni se lista por defecto ni cotiza, pero el catálogo no se cae.
 */
export function mapStatus(
  gameState: string,
  conditionState: string,
  conditionHidden: boolean,
): MarketStatus {
  switch (conditionState) {
    case 'Resolved':
      return 'resolved'
    case 'Canceled':
    case 'Removed':
      return 'closed'
    case 'Stopped':
      return 'suspended'
    case 'Active':
      break
    default:
      return 'suspended'
  }
  // La condición está activa; manda el estado del juego.
  if (conditionHidden) return 'suspended'
  switch (gameState) {
    case 'Prematch':
    case 'Live':
      return 'open'
    case 'Stopped':
      return 'suspended'
    case 'Finished':
    case 'Canceled':
      return 'closed'
    default:
      return 'suspended'
  }
}

// --- Ayudas -----------------------------------------------------------------

/** `toDecimal` que no lanza: un dato corrupto se convierte en `null`. */
function safeDecimal(value: string): DecimalString | null {
  try {
    return toDecimal(value)
  } catch {
    return null
  }
}

/** Número del venue → DecimalString, o `null` si no es representable. */
export function numberToDecimal(value: number): DecimalString | null {
  if (!Number.isFinite(value) || value < 0) return null
  const fixed = value.toFixed(8).replace(/\.?0+$/, '')
  return safeDecimal(fixed === '' || fixed === '-' ? '0' : fixed)
}

/** Nombre del mercado vía diccionarios oficiales, con fallback seguro. */
function marketTitleOf(condition: RawCondition): string {
  if (condition.title !== null && condition.title.trim() !== '') {
    return condition.title
  }
  const first = condition.outcomes[0]
  if (first !== undefined) {
    try {
      return getMarketName({ outcomeId: first.outcomeId })
    } catch {
      // outcomeId fuera del diccionario: caemos al genérico.
    }
  }
  return 'Mercado'
}

function outcomeLabelOf(outcome: RawOutcome): string {
  if (outcome.title !== null && outcome.title.trim() !== '') {
    return outcome.title
  }
  try {
    return getSelectionName({ outcomeId: outcome.outcomeId, withPoint: true })
  } catch {
    return `Resultado ${outcome.outcomeId}`
  }
}

// --- Mercado ----------------------------------------------------------------

/**
 * El id nativo empaqueta juego y condición (`gameId/conditionId`): la API de
 * Azuro descubre condiciones a través del juego, así que `getMarket` necesita
 * ambos para resolver sin listar todo el catálogo.
 */
export function makeNativeId(gameId: string, conditionId: string): string {
  return `${gameId}/${conditionId}`
}

export function parseNativeId(
  nativeId: string,
): { gameId: string; conditionId: string } | null {
  const idx = nativeId.indexOf('/')
  if (idx <= 0 || idx === nativeId.length - 1) return null
  return { gameId: nativeId.slice(0, idx), conditionId: nativeId.slice(idx + 1) }
}

export function mapConditionToMarket(
  game: RawGame,
  condition: RawCondition,
  venue: VenueId,
  chainId: number,
): Market {
  const status = mapStatus(game.state, condition.state, condition.hidden)
  const isResolved = status === 'resolved'

  const outcomes: Outcome[] = condition.outcomes.map((raw) => {
    const price = safeDecimal(raw.odds)
    const probability = priceToProbability(price, 'decimal-odds')
    // Cotizable solo si el mercado está abierto, el outcome no está oculto ni
    // parado, y la cuota es una cuota real (> 1). En cualquier otro caso la
    // probabilidad es `null` y la UI muestra "sin cotización", nunca 0%.
    const isQuotable =
      status === 'open' &&
      !raw.hidden &&
      (raw.state === null || raw.state === 'Active') &&
      probability !== null

    return {
      id: raw.outcomeId,
      label: outcomeLabelOf(raw),
      probability: isQuotable ? probability : null,
      price: isQuotable ? price : null,
      isQuotable,
      ...(isResolved
        ? { isWinner: condition.wonOutcomeIds.includes(raw.outcomeId) }
        : {}),
    }
  })

  const startsAtMs = Number(game.startsAt) * 1000
  // En vivo no hay "cierre" conocido: `closesAt` pasado haría que isListable
  // ocultase mercados en juego que sí cotizan.
  const closesAt =
    game.state === 'Live'
      ? null
      : Number.isFinite(startsAtMs)
        ? new Date(startsAtMs)
        : null

  const groupImage = game.participants[0]?.image ?? undefined

  return {
    id: makeMarketId(venue, makeNativeId(game.gameId, condition.conditionId)),
    venue,
    chainId,
    question: `${game.title} · ${marketTitleOf(condition)}`,
    category: 'sports',
    subcategory: game.sport.slug,
    outcomes,
    status,
    closesAt,
    // La liquidez en Azuro es del pool del protocolo, no del mercado; y el
    // `turnover` del juego no es volumen 24h. Antes que mentir: null.
    liquidityUsd: null,
    volume24hUsd: null,
    isQuotable: status === 'open' && outcomes.some((o) => o.isQuotable),
    priceFormat: 'decimal-odds',
    group: {
      id: game.gameId,
      label: game.title,
      ...(groupImage !== undefined ? { imageUrl: groupImage } : {}),
    },
    raw: { game, condition },
  }
}

// --- Posiciones ---------------------------------------------------------------

/**
 * Orden de apuesta → posición del dominio.
 *
 * Devuelve `null` para órdenes que no representan una posición del usuario:
 * combos (fuera del alcance de la Fase 2), órdenes rechazadas o canceladas
 * antes de aceptarse, o datos no representables.
 */
export function mapOrderToPosition(
  order: RawBetOrder,
  gameTitleByGameId: ReadonlyMap<string, string>,
  venue: VenueId,
): Position | null {
  if (order.betType !== 'ORDINARY') return null
  if (order.state === 'Rejected' || order.state === 'Canceled') return null
  const leg = order.conditions[0]
  if (leg === undefined) return null

  const stake = numberToDecimal(order.amount)
  const potentialPayout =
    order.payout !== null
      ? numberToDecimal(order.payout)
      : numberToDecimal(order.amount * order.odds)
  if (stake === null || potentialPayout === null) return null

  const openedAtMs = Date.parse(order.createdAt)
  if (!Number.isFinite(openedAtMs)) return null

  let status: Position['status']
  switch (order.result) {
    case null:
      status = 'open'
      break
    case 'Lost':
      status = 'lost'
      break
    case 'Won':
    case 'Canceled': // condición cancelada: el stake se devuelve, se reclama igual
      status = order.redeemedAt !== null ? 'redeemed' : 'redeemable'
      break
    default:
      // Resultado desconocido del servidor: mejor mostrarla abierta que
      // inventar un desenlace.
      status = 'open'
      break
  }

  const gameTitle = gameTitleByGameId.get(leg.gameId)
  let outcomeLabel: string
  try {
    outcomeLabel = getSelectionName({ outcomeId: leg.outcomeId, withPoint: true })
  } catch {
    outcomeLabel = `Resultado ${leg.outcomeId}`
  }
  let marketLabel: string
  try {
    marketLabel = getMarketName({ outcomeId: leg.outcomeId })
  } catch {
    marketLabel = 'Mercado'
  }

  return {
    marketId: makeMarketId(venue, makeNativeId(leg.gameId, leg.conditionId)),
    outcomeId: leg.outcomeId,
    marketQuestion:
      gameTitle !== undefined ? `${gameTitle} · ${marketLabel}` : marketLabel,
    outcomeLabel,
    stake,
    potentialPayout,
    currentValue: null,
    status,
    openedAt: new Date(openedAtMs),
  }
}
