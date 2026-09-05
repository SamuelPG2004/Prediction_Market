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
  league: { slug: string; name: string; isTopLeague: boolean }
  /** País/ámbito de la competición; la API puede omitirlo. */
  country: { slug: string; name: string } | null
  participants: { name: string; image: string | null }[]
  /**
   * Volumen apostado acumulado del juego, como string decimal, o `null` si la
   * API no lo trae. NO es volumen 24h: solo sirve para ordenar por
   * popularidad, nunca para mostrarse como métrica.
   */
  turnover: string | null
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

/**
 * Cálculo de cash out del Backend API (`/cashout/get-calculation`). Formas
 * según los tipos del toolkit v6; las rutas /cashout/* aún no están
 * desplegadas en la API pública (2026-09-01), así que estos parsers se
 * validaron contra fixtures sintéticos con esas formas. Al activarse el
 * servicio: recapturar fixtures reales y revisar unidades de `cashoutAmount`.
 */
export interface RawCashoutCalculation {
  calculationId: string
  /** Importe ofrecido, decimal en el token de apuesta. */
  cashoutAmount: string
  /** Cuota del cash out, tal cual la firma la API (va al typed data). */
  cashoutOdds: string
  /** Token id on-chain de la apuesta (vuelve como `betId` y se renombra). */
  tokenId: string
  /** Caducidad de la oferta, epoch en SEGUNDOS. */
  expiredAt: number
}

export interface RawCashoutResponse {
  id: string
  /** PROCESSING | ACCEPTED | REJECTED | OPEN */
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
  /** Token id on-chain de la apuesta; null hasta que el relayer la mina. */
  betId: number | null
  /** Contrato core de ESTA apuesta (puede diferir del core de config). */
  core: string | null
  conditions: RawBetOrderCondition[]
}

/** Liga de la navegación, dentro de un país. */
export interface RawNavigationLeague {
  slug: string
  name: string
  activePrematchGamesCount: number | null
}

/** País de la navegación, con sus ligas. */
export interface RawNavigationCountry {
  slug: string
  name: string
  leagues: RawNavigationLeague[]
}

/** Deporte de la navegación: solo lo que consume el adaptador. */
export interface RawNavigationSport {
  slug: string
  name: string
  /** El listado usa estado Prematch; este recuento es el que le corresponde. */
  activePrematchGamesCount: number | null
  /** Países → ligas. Un elemento malformado se descarta sin tirar el deporte. */
  countries: RawNavigationCountry[]
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
  // Opcional en la API: ausente o malformado se trata como "no es liga top",
  // que solo degrada el orden de Destacados, nunca el catálogo.
  const isTopLeague = u.league.isTopLeague === true

  // País: opcional. Sin él solo se pierde la desambiguación del filtro de
  // liga y la etiqueta de país, nunca el juego.
  let country: RawGame['country'] = null
  if (isRecord(u.country)) {
    const countrySlug = asString(u.country.slug)
    const countryName = asString(u.country.name)
    if (countrySlug !== null && countryName !== null) {
      country = { slug: countrySlug, name: countryName }
    }
  }

  const participants: RawGame['participants'] = []
  if (Array.isArray(u.participants)) {
    for (const p of u.participants) {
      if (!isRecord(p)) continue
      const name = asString(p.name)
      if (name === null) continue
      participants.push({ name, image: asOptionalString(p.image) })
    }
  }

  // Solo un decimal no negativo cuenta como turnover; cualquier otra cosa es
  // `null` para que un dato corrupto no infle la popularidad de un juego.
  const rawTurnover = asString(u.turnover)
  const turnover =
    rawTurnover !== null && /^\d+(\.\d+)?$/.test(rawTurnover) ? rawTurnover : null

  return {
    gameId,
    title,
    startsAt,
    state,
    sport: { sportId, slug: sportSlug, name: sportName },
    league: { slug: leagueSlug, name: leagueName, isTopLeague },
    country,
    participants,
    turnover,
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

/**
 * Respuesta de la BÚSQUEDA. La doc del toolkit promete la misma paginación que
 * el listado, pero la API real (verificado 2026-09-05) devuelve solo
 * `{ games }`: exigir `page`/`totalPages` aquí tiraba TODA búsqueda como
 * respuesta inválida ("Real Madrid" → "Sin resultados"). El total de elementos
 * crudos (`rawCount`) permite al adaptador deducir si puede haber más páginas.
 */
export function parseSearchGames(
  u: unknown,
): Parsed<{ games: RawGame[]; rawCount: number }> | null {
  if (!isRecord(u) || !Array.isArray(u.games)) return null
  const games: RawGame[] = []
  let dropped = 0
  for (const raw of u.games) {
    const game = parseGame(raw)
    if (game === null) dropped += 1
    else games.push(game)
  }
  return { value: { games, rawCount: u.games.length }, dropped }
}

function parseNavigationLeague(u: unknown): RawNavigationLeague | null {
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

function parseNavigationSport(u: unknown): RawNavigationSport | null {
  if (!isRecord(u)) return null
  const slug = asString(u.slug)
  const name = asString(u.name)
  if (slug === null || name === null) return null

  const countries: RawNavigationCountry[] = []
  if (Array.isArray(u.countries)) {
    for (const c of u.countries) {
      if (!isRecord(c)) continue
      const countrySlug = asString(c.slug)
      const countryName = asString(c.name)
      if (countrySlug === null || countryName === null) continue
      const leagues: RawNavigationLeague[] = []
      if (Array.isArray(c.leagues)) {
        for (const l of c.leagues) {
          const league = parseNavigationLeague(l)
          if (league !== null) leagues.push(league)
        }
      }
      countries.push({ slug: countrySlug, name: countryName, leagues })
    }
  }

  return {
    slug,
    name,
    activePrematchGamesCount: asFiniteNumber(u.activePrematchGamesCount),
    countries,
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

export function parseCashoutCalculation(
  u: unknown,
): RawCashoutCalculation | null {
  if (!isRecord(u)) return null
  const calculationId = asString(u.calculationId)
  const cashoutOdds = asString(u.cashoutOdds)
  const tokenId = asString(u.tokenId)
  const expiredAt = asFiniteNumber(u.expiredAt)
  // Solo un decimal no negativo cuenta como importe; cualquier otra cosa es
  // una respuesta que no se puede enseñar como dinero.
  const rawAmount = asString(u.cashoutAmount)
  const cashoutAmount =
    rawAmount !== null && /^\d+(\.\d+)?$/.test(rawAmount.trim())
      ? rawAmount.trim()
      : null
  if (
    calculationId === null ||
    cashoutAmount === null ||
    cashoutOdds === null ||
    tokenId === null ||
    expiredAt === null ||
    expiredAt <= 0
  ) {
    return null
  }
  return { calculationId, cashoutAmount, cashoutOdds, tokenId, expiredAt }
}

export function parseCashoutResponse(u: unknown): RawCashoutResponse | null {
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
      betId: asFiniteNumber(raw.betId),
      core: asOptionalString(raw.core),
      conditions,
    })
  }
  return { value: orders, dropped }
}
