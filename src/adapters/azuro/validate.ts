/**
 * Validación de las respuestas del Backend API de Azuro.
 *
 * Regla del proyecto: toda respuesta externa se valida antes de mapear, aunque
 * el toolkit declare tipos (son solo de compilación; la API real ya se desvía
 * de ellos). Sin zod a propósito: guards a mano, cero dependencias.
 *
 * Criterio: estricto con la ESTRUCTURA (un campo obligatorio ausente invalida
 * el elemento), tolerante con los ENUMS (un estado desconocido no invalida:
 * el mapper lo degrada a "no cotizable"). Así una respuesta corrupta no cuela
 * y un valor nuevo del servidor no tira el catálogo entero.
 *
 * Un elemento inválido se descarta y se cuenta en `dropped`; una estructura
 * de nivel superior inválida devuelve `null` y el adaptador lo convierte en
 * un error `invalid_response`.
 */

// --- Formas crudas que el adaptador consume -------------------------------

export interface RawGame {
  gameId: string
  title: string
  /** Unix en segundos, como string. */
  startsAt: string
  state: string
  sport: { sportId: string; slug: string; name: string }
  league: { slug: string; name: string }
  participants: { name: string; image: string | null }[]
}

export interface RawGamesPage {
  games: RawGame[]
  page: number
  totalPages: number
}

export interface RawOutcome {
  outcomeId: string
  title: string | null
  odds: string
  hidden: boolean
  state: string | null
}

export interface RawCondition {
  conditionId: string
  state: string
  title: string | null
  hidden: boolean
  gameId: string
  wonOutcomeIds: string[]
  outcomes: RawOutcome[]
}

/** Respuesta de `condition-batch` (estado fresco para cotizar). */
export interface RawConditionState {
  conditionId: string
  state: string
  outcomes: RawOutcome[]
}

export interface RawBetCalculation {
  minBet: number | null
  maxBet: number
}

export interface RawBetFee {
  relayerFeeAmount: string
  decimals: number
  symbol: string
}

export interface RawCreateBetResponse {
  id: string
  state: string
  errorMessage: string | null
}

export interface RawBetOrderCondition {
  conditionId: string
  outcomeId: string
  gameId: string
  /** Cuota formateada, p. ej. "1.85". */
  price: string
}

export interface RawBetOrder {
  id: string
  state: string
  betType: string
  amount: number
  payout: number | null
  odds: number
  result: string | null
  redeemedAt: string | null
  createdAt: string
  txHash: string | null
  conditions: RawBetOrderCondition[]
}

/** Deporte de la navegación: solo lo que consume el adaptador. */
export interface RawNavigationSport {
  slug: string
  name: string
  /** El listado usa estado Prematch; este recuento es el que le corresponde. */
  activePrematchGamesCount: number | null
}

export interface Parsed<T> {
  value: T
  /** Elementos individuales descartados por no validar. */
  dropped: number
}

// --- Guards básicos --------------------------------------------------------

function isRecord(u: unknown): u is Record<string, unknown> {
  return typeof u === 'object' && u !== null
}

function asString(u: unknown): string | null {
  return typeof u === 'string' ? u : null
}

function asOptionalString(u: unknown): string | null {
  return typeof u === 'string' ? u : null
}

function asFiniteNumber(u: unknown): number | null {
  return typeof u === 'number' && Number.isFinite(u) ? u : null
}

function asBoolean(u: unknown, fallback: boolean): boolean {
  return typeof u === 'boolean' ? u : fallback
}

function asStringArray(u: unknown): string[] {
  if (!Array.isArray(u)) return []
  return u.filter((item): item is string => typeof item === 'string')
}

// --- Parseadores -----------------------------------------------------------

function parseGame(u: unknown): RawGame | null {
  if (!isRecord(u)) return null
  const gameId = asString(u.gameId)
  const title = asString(u.title)
  const startsAt = asString(u.startsAt)
  const state = asString(u.state)
  if (gameId === null || title === null || startsAt === null || state === null) {
    return null
  }
  if (!/^\d+$/.test(startsAt)) return null

  if (!isRecord(u.sport)) return null
  const sportId = asString(u.sport.sportId)
  const sportSlug = asString(u.sport.slug)
  const sportName = asString(u.sport.name)
  if (sportId === null || sportSlug === null || sportName === null) return null

  if (!isRecord(u.league)) return null
  const leagueSlug = asString(u.league.slug)
  const leagueName = asString(u.league.name)
  if (leagueSlug === null || leagueName === null) return null

  const participants: RawGame['participants'] = []
  if (Array.isArray(u.participants)) {
    for (const p of u.participants) {
      if (!isRecord(p)) continue
      const name = asString(p.name)
      if (name === null) continue
      participants.push({ name, image: asOptionalString(p.image) })
    }
  }

  return {
    gameId,
    title,
    startsAt,
    state,
    sport: { sportId, slug: sportSlug, name: sportName },
    league: { slug: leagueSlug, name: leagueName },
    participants,
  }
}

export function parseGamesPage(u: unknown): Parsed<RawGamesPage> | null {
  if (!isRecord(u) || !Array.isArray(u.games)) return null
  const page = asFiniteNumber(u.page)
  const totalPages = asFiniteNumber(u.totalPages)
  if (page === null || totalPages === null) return null

  const games: RawGame[] = []
  let dropped = 0
  for (const raw of u.games) {
    const game = parseGame(raw)
    if (game === null) dropped += 1
    else games.push(game)
  }
  return { value: { games, page, totalPages }, dropped }
}

function parseNavigationSport(u: unknown): RawNavigationSport | null {
  if (!isRecord(u)) return null
  const slug = asString(u.slug)
  const name = asString(u.name)
  if (slug === null || name === null) return null
  return {
    slug,
    name,
    activePrematchGamesCount: asFiniteNumber(u.activePrematchGamesCount),
  }
}

export function parseNavigation(u: unknown): Parsed<RawNavigationSport[]> | null {
  if (!Array.isArray(u)) return null
  const sports: RawNavigationSport[] = []
  let dropped = 0
  for (const raw of u) {
    const sport = parseNavigationSport(raw)
    if (sport === null) dropped += 1
    else sports.push(sport)
  }
  return { value: sports, dropped }
}

export function parseGames(u: unknown): Parsed<RawGame[]> | null {
  if (!Array.isArray(u)) return null
  const games: RawGame[] = []
  let dropped = 0
  for (const raw of u) {
    const game = parseGame(raw)
    if (game === null) dropped += 1
    else games.push(game)
  }
  return { value: games, dropped }
}

function parseOutcome(u: unknown): RawOutcome | null {
  if (!isRecord(u)) return null
  const outcomeId = asString(u.outcomeId)
  const odds = asString(u.odds)
  if (outcomeId === null || odds === null) return null
  return {
    outcomeId,
    odds,
    title: asOptionalString(u.title),
    hidden: asBoolean(u.hidden, false),
    state: asOptionalString(u.state),
  }
}

function parseCondition(u: unknown): RawCondition | null {
  if (!isRecord(u)) return null
  const conditionId = asString(u.conditionId)
  const state = asString(u.state)
  if (conditionId === null || state === null) return null
  if (!isRecord(u.game)) return null
  const gameId = asString(u.game.gameId)
  if (gameId === null) return null
  if (!Array.isArray(u.outcomes)) return null

  const outcomes: RawOutcome[] = []
  for (const raw of u.outcomes) {
    const outcome = parseOutcome(raw)
    // Un outcome malformado invalida la condición entera: un mercado al que
    // le falta una pata no es apostable con seguridad.
    if (outcome === null) return null
    outcomes.push(outcome)
  }
  if (outcomes.length === 0) return null

  return {
    conditionId,
    state,
    title: asOptionalString(u.title),
    hidden: asBoolean(u.hidden, false),
    gameId,
    wonOutcomeIds: asStringArray(u.wonOutcomeIds),
    outcomes,
  }
}

export function parseConditions(u: unknown): Parsed<RawCondition[]> | null {
  if (!Array.isArray(u)) return null
  const conditions: RawCondition[] = []
  let dropped = 0
  for (const raw of u) {
    const condition = parseCondition(raw)
    if (condition === null) dropped += 1
    else conditions.push(condition)
  }
  return { value: conditions, dropped }
}

export function parseConditionStates(
  u: unknown,
): Parsed<RawConditionState[]> | null {
  if (!Array.isArray(u)) return null
  const states: RawConditionState[] = []
  let dropped = 0
  for (const raw of u) {
    if (!isRecord(raw)) {
      dropped += 1
      continue
    }
    const conditionId = asString(raw.conditionId)
    const state = asString(raw.state)
    if (conditionId === null || state === null || !Array.isArray(raw.outcomes)) {
      dropped += 1
      continue
    }
    const outcomes: RawOutcome[] = []
    let valid = true
    for (const o of raw.outcomes) {
      const outcome = parseOutcome(o)
      if (outcome === null) {
        valid = false
        break
      }
      outcomes.push(outcome)
    }
    if (!valid) {
      dropped += 1
      continue
    }
    states.push({ conditionId, state, outcomes })
  }
  return { value: states, dropped }
}

export function parseBetCalculation(u: unknown): RawBetCalculation | null {
  if (!isRecord(u)) return null
  const maxBet = asFiniteNumber(u.maxBet)
  if (maxBet === null) return null
  return { maxBet, minBet: asFiniteNumber(u.minBet) }
}

export function parseBetFee(u: unknown): RawBetFee | null {
  if (!isRecord(u)) return null
  const relayerFeeAmount = asString(u.relayerFeeAmount)
  const decimals = asFiniteNumber(u.decimals)
  const symbol = asString(u.symbol)
  if (relayerFeeAmount === null || decimals === null || symbol === null) {
    return null
  }
  if (!/^\d+$/.test(relayerFeeAmount)) return null
  return { relayerFeeAmount, decimals, symbol }
}

export function parseCreateBetResponse(u: unknown): RawCreateBetResponse | null {
  if (!isRecord(u)) return null
  const id = asString(u.id)
  const state = asString(u.state)
  if (id === null || state === null) return null
  return { id, state, errorMessage: asOptionalString(u.errorMessage) }
}

export function parseBetOrders(u: unknown): Parsed<RawBetOrder[]> | null {
  // El toolkit devuelve `null` cuando el bettor no tiene apuestas.
  if (u === null) return { value: [], dropped: 0 }
  if (!Array.isArray(u)) return null

  const orders: RawBetOrder[] = []
  let dropped = 0
  for (const raw of u) {
    if (!isRecord(raw)) {
      dropped += 1
      continue
    }
    const id = asString(raw.id)
    const state = asString(raw.state)
    const betType = asString(raw.betType)
    const amount = asFiniteNumber(raw.amount)
    const odds = asFiniteNumber(raw.odds)
    const createdAt = asString(raw.createdAt)
    if (
      id === null ||
      state === null ||
      betType === null ||
      amount === null ||
      odds === null ||
      createdAt === null ||
      !Array.isArray(raw.conditions)
    ) {
      dropped += 1
      continue
    }

    const conditions: RawBetOrderCondition[] = []
    let valid = true
    for (const c of raw.conditions) {
      if (!isRecord(c)) {
        valid = false
        break
      }
      const conditionId = asString(c.conditionId)
      const gameId = asString(c.gameId)
      const price = asString(c.price)
      // `outcomeId` llega como número en las órdenes; lo normalizamos a string.
      const outcomeIdNum = asFiniteNumber(c.outcomeId)
      const outcomeId =
        outcomeIdNum !== null ? String(outcomeIdNum) : asString(c.outcomeId)
      if (
        conditionId === null ||
        gameId === null ||
        price === null ||
        outcomeId === null
      ) {
        valid = false
        break
      }
      conditions.push({ conditionId, outcomeId, gameId, price })
    }
    if (!valid || conditions.length === 0) {
      dropped += 1
      continue
    }

    orders.push({
      id,
      state,
      betType,
      amount,
      odds,
      createdAt,
      payout: asFiniteNumber(raw.payout),
      result: asOptionalString(raw.result),
      redeemedAt: asOptionalString(raw.redeemedAt),
      txHash: asOptionalString(raw.txHash),
      conditions,
    })
  }
  return { value: orders, dropped }
}
