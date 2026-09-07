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
  type LiveScore,
  type LiveScorePhase,
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
  RawLiveScoreEntry,
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
  // Presentación del enfrentamiento: la tarjeta puede pintar "A vs B" con los
  // escudos de ambos equipos, la liga y el estado en vivo.
  const participants = game.participants.map((p) => ({
    name: p.name,
    ...(p.image !== null ? { imageUrl: p.image } : {}),
  }))

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
      ...(participants.length > 0 ? { participants } : {}),
      leagueName: game.league.name,
      ...(game.country !== null ? { countryName: game.country.name } : {}),
      isLive: game.state === 'Live',
      // El turnover del juego SÍ es el total apostado al partido (en USDT ≈
      // USD); un cero (partido recién publicado) se omite para no pintarlo.
      ...(game.turnover !== null && Number(game.turnover) > 0
        ? { totalVolumeUsd: Number(game.turnover) }
        : {}),
    },
    raw: { game, condition },
  }
}

// --- Marcadores en vivo -------------------------------------------------------

/**
 * ¿Puede este juego tener estadísticas en vivo? El socket solo cubre el
 * proveedor 6, que va codificado en los caracteres 2-4 del gameId (mismo
 * criterio que `getProviderFromId` del toolkit). Suscribirse a juegos de otro
 * proveedor no es un error — el socket simplemente no manda nada — pero se
 * filtran para no pagar suscripciones muertas.
 */
export function isLiveScoreEligibleGameId(gameId: string): boolean {
  return /^\d{4,}$/.test(gameId) && Number(gameId.slice(1, 4)) === 6
}

/** 'S2' → set 2, 'Q4' → cuarto 4. Cualquier otra cosa no es una fase fiable. */
function periodNumberOf(state: string | null, prefix: 'S' | 'Q'): number | null {
  if (state === null) return null
  const match = state.match(/^([SQ])(\d)$/)
  if (match === null || match[1] !== prefix) return null
  return Number(match[2])
}

/**
 * Entrada del socket → marcador del dominio, o `null` si no hay nada
 * mostrable (sin marcador utilizable, o el partido no ha empezado).
 *
 * El deporte se detecta por la FORMA del marcador, no por un campo de deporte:
 * `total` (puntos) es baloncesto, `sets` es tenis/voleibol y los goles
 * (`stats.goals`, con `scoreBoard.goals` de respaldo) son fútbol. Así una
 * entrada con `fixture` nulo o un deporte nuevo del proveedor degradan a
 * "sin marcador" en vez de a un marcador equivocado.
 */
export function mapLiveScore(
  entry: RawLiveScoreEntry,
  updatedAt: Date,
): LiveScore | null {
  let status: LiveScore['status']
  switch (entry.status) {
    case 'In progress':
      status = 'live'
      break
    case 'Finished':
    case 'PreFinished':
      status = 'finished'
      break
    case 'Not started yet':
      // Aún no hay marcador que enseñar ni que retirar.
      return null
    case 'Coverage lost':
    case 'Suspended':
      status = 'suspended'
      break
    default:
      // Estado desconocido o ausente: el marcador no es de fiar.
      status = 'suspended'
      break
  }

  const scoreBoard = entry.scoreBoard
  let score: { h: number; g: number } | null = null
  let phase: LiveScorePhase | null = null
  let periodScores: { home: number; guest: number }[] = []

  if (scoreBoard?.total != null) {
    // Baloncesto: puntos totales y parciales por cuarto.
    score = scoreBoard.total
    periodScores = scoreBoard.periods.map((p) => ({ home: p.h, guest: p.g }))
    const quarter = periodNumberOf(scoreBoard.state, 'Q')
    if (quarter !== null) {
      phase = { kind: 'quarter', number: quarter, clock: scoreBoard.time }
    }
  } else if (scoreBoard?.sets != null) {
    // Tenis/voleibol: sets ganados y juegos/puntos por set.
    score = scoreBoard.sets
    periodScores = scoreBoard.periods.map((p) => ({ home: p.h, guest: p.g }))
    const set = periodNumberOf(scoreBoard.state, 'S')
    if (set !== null) phase = { kind: 'set', number: set }
  } else {
    // Fútbol: el scoreBoard real llega vacío; los goles fiables están en
    // `stats.goals` y el minuto se deduce del timeline.
    const goals = entry.statsGoals ?? scoreBoard?.goals ?? null
    if (goals !== null) {
      score = goals
      phase = { kind: 'match', minute: entry.lastIncidentMinute }
    }
  }

  if (score === null) {
    // Sin marcador utilizable solo tiene sentido emitir la RETIRADA de uno
    // (suspended); un "final" o un "en juego" sin marcador serían inventados.
    if (status !== 'suspended') return null
    return {
      groupId: entry.gameId,
      status,
      home: 0,
      guest: 0,
      phase: null,
      updatedAt,
    }
  }

  return {
    groupId: entry.gameId,
    status,
    home: score.h,
    guest: score.g,
    phase,
    ...(periodScores.length > 0 ? { periodScores } : {}),
    updatedAt,
  }
}

// --- Posiciones ---------------------------------------------------------------

/**
 * Orden de apuesta → posición del dominio.
 *
 * Las órdenes ORDINARY son una posición con su mercado; las COMBO se
 * representan como UNA posición cuyo resultado es la lista de patas (todas
 * deben acertar) — cobrarlas usa el mismo `withdrawPayout` con su `core`
 * propio. Devuelve `null` para órdenes que no representan una posición:
 * rechazadas o canceladas antes de aceptarse, o datos no representables.
 */
export function mapOrderToPosition(
  order: RawBetOrder,
  gameTitleByGameId: ReadonlyMap<string, string>,
  venue: VenueId,
): Position | null {
  if (order.betType !== 'ORDINARY' && order.betType !== 'COMBO') return null
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

  const selectionNameOf = (outcomeId: string): string => {
    try {
      return getSelectionName({ outcomeId, withPoint: true })
    } catch {
      return `Resultado ${outcomeId}`
    }
  }

  let marketId: string
  let outcomeId: string
  let marketQuestion: string
  let outcomeLabel: string
  if (order.betType === 'COMBO') {
    // Una combinada no vive en un mercado concreto: el id es sintético y las
    // patas se desnormalizan en la etiqueta ("Equipo A + Más de 2.5 …").
    marketId = makeMarketId(venue, `combo/${order.id}`)
    outcomeId = 'combo'
    marketQuestion = `Combinada · ${order.conditions.length} selecciones · cuota ${order.odds}`
    outcomeLabel = order.conditions
      .map((c) => {
        const title = gameTitleByGameId.get(c.gameId)
        const name = selectionNameOf(c.outcomeId)
        return title !== undefined ? `${name} (${title})` : name
      })
      .join(' + ')
  } else {
    const gameTitle = gameTitleByGameId.get(leg.gameId)
    let marketLabel: string
    try {
      marketLabel = getMarketName({ outcomeId: leg.outcomeId })
    } catch {
      marketLabel = 'Mercado'
    }
    marketId = makeMarketId(venue, makeNativeId(leg.gameId, leg.conditionId))
    outcomeId = leg.outcomeId
    marketQuestion =
      gameTitle !== undefined ? `${gameTitle} · ${marketLabel}` : marketLabel
    outcomeLabel = selectionNameOf(leg.outcomeId)
  }

  return {
    id: order.id,
    marketId,
    outcomeId,
    marketQuestion,
    outcomeLabel,
    stake,
    potentialPayout,
    currentValue: null,
    status,
    openedAt: new Date(openedAtMs),
    // Lo mínimo para cobrarla on-chain (LP.withdrawPayout). Si el relayer aún
    // no minó la apuesta no hay betId, y la posición no se puede operar.
    ...(order.betId !== null && order.core !== null
      ? { venueData: { betId: order.betId, core: order.core } }
      : {}),
  }
}
