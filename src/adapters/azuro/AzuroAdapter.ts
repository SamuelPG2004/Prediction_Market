/**
 * Adaptador de Azuro: implementa el puerto `MarketSource` del dominio.
 *
 * Deportes en Polygon (por defecto). Descubrimiento y cotización contra el
 * Backend API oficial; colocación de apuestas vía relayer con firma EIP-712.
 * La UI no ve nada de esto: solo el dominio.
 *
 * Alcance (documentado, no accidental):
 *  - Se listan juegos PREMATCH por defecto; con `filter.state: 'live'`, los
 *    que están EN JUEGO (mismo Backend API, `GameState.Live`). Sin websocket:
 *    el refresco es por sondeo (`canSubscribe: false`).
 *  - Simples y combinadas van por el mismo relayer con firma EIP-712.
 */
import {
  ODDS_DECIMALS,
  calcMinOdds,
  getBetTypedData,
  getCashoutTypedData,
  getComboBetTypedData,
  type ChainId,
} from '@azuro-org/toolkit'
import { isAddress, parseUnits, formatUnits, type Address, type Hex } from 'viem'
import {
  isListable,
  parseMarketId,
  toDecimal,
  type BetOptions,
  type BetReceipt,
  type CashoutOffer,
  type CashoutReceipt,
  type ComboBetReceipt,
  type ComboQuote,
  type ComboSelection,
  type DecimalString,
  type League,
  type Market,
  type MarketCategory,
  type MarketFilter,
  type MarketPage,
  type MarketSource,
  type Position,
  type Subcategory,
  type Quote,
  type RedeemReceipt,
  type Result,
  type VenueCapabilities,
  type VenueError,
  type VenueErrorKind,
} from '../../domain/types.ts'
import type { AzuroConfig } from './config.ts'
import type { AzuroGateway, AzuroWalletBridge } from './gateway.ts'
import {
  mapConditionToMarket,
  mapOrderToPosition,
  parseNativeId,
} from './mappers.ts'
import {
  parseBetCalculation,
  parseBetFee,
  parseBetOrders,
  parseCashoutCalculation,
  parseCashoutResponse,
  parseConditionStates,
  parseConditions,
  parseCreateBetResponse,
  parseGames,
  parseGamesPage,
  parseNavigation,
  parseSearchGames,
  type RawGame,
} from './validate.ts'

export const AZURO_VENUE_ID = 'azuro'

/** Juegos por página de la API. Su mínimo documentado es 10. */
const GAMES_PER_PAGE = 10
/** La búsqueda de Azuro exige al menos 3 caracteres. */
const MIN_SEARCH_LENGTH = 3
/** Validez de la orden firmada si la UI no fija `deadlineMs`. */
const DEFAULT_BET_DEADLINE_MS = 5 * 60 * 1000

/** Contenido de `Quote.venueData` para Azuro. Solo este adaptador lo lee. */
interface AzuroQuoteData {
  conditionId: string
  outcomeId: string
  /** Cuota decimal al cotizar, p. ej. "1.85". Base del `minOdds` firmado. */
  odds: string
}

/** Contenido de `ComboQuote.venueData` para Azuro. Solo este adaptador lo lee. */
interface AzuroComboQuoteData {
  legs: { conditionId: string; outcomeId: string; odds: string }[]
  /** Cuota combinada al cotizar (producto), base del `minOdds` firmado. */
  totalOdds: string
}

function isAzuroComboQuoteData(u: unknown): u is AzuroComboQuoteData {
  if (typeof u !== 'object' || u === null) return false
  const record = u as Record<string, unknown>
  return (
    typeof record.totalOdds === 'string' &&
    Array.isArray(record.legs) &&
    record.legs.every(
      (leg) =>
        typeof leg === 'object' &&
        leg !== null &&
        typeof (leg as Record<string, unknown>).conditionId === 'string' &&
        typeof (leg as Record<string, unknown>).outcomeId === 'string' &&
        typeof (leg as Record<string, unknown>).odds === 'string',
    )
  )
}

/** Contenido de `Position.venueData` para Azuro. Solo este adaptador lo lee. */
interface AzuroPositionData {
  /** Token id on-chain de la apuesta, argumento de `LP.withdrawPayout`. */
  betId: number
  /** Contrato core de ESTA apuesta (puede diferir del core de config). */
  core: string
}

function isAzuroPositionData(u: unknown): u is AzuroPositionData {
  return (
    typeof u === 'object' &&
    u !== null &&
    typeof (u as Record<string, unknown>).betId === 'number' &&
    typeof (u as Record<string, unknown>).core === 'string'
  )
}

/** Contenido de `CashoutOffer.venueData` para Azuro. Solo este adaptador lo lee. */
interface AzuroCashoutData {
  calculationId: string
  /** Token id de la apuesta, tal como lo devolvió el cálculo. */
  tokenId: string
  /** Cuota del cash out, verbatim del cálculo (va al typed data). */
  cashoutOdds: string
  /** Caducidad de la oferta, epoch en segundos (formato del typed data). */
  expiredAt: number
}

function isAzuroCashoutData(u: unknown): u is AzuroCashoutData {
  if (typeof u !== 'object' || u === null) return false
  const r = u as Record<string, unknown>
  return (
    typeof r.calculationId === 'string' &&
    typeof r.tokenId === 'string' &&
    typeof r.cashoutOdds === 'string' &&
    typeof r.expiredAt === 'number'
  )
}

/**
 * Texto de consentimiento de la orden de cash out: viaja idéntico en el typed
 * data firmado y en el envío a la API (deben coincidir).
 */
const CASHOUT_ATTENTION = 'By signing this transaction, I agree to cash out on Azuro'

function isAzuroQuoteData(u: unknown): u is AzuroQuoteData {
  return (
    typeof u === 'object' &&
    u !== null &&
    typeof (u as Record<string, unknown>).conditionId === 'string' &&
    typeof (u as Record<string, unknown>).outcomeId === 'string' &&
    typeof (u as Record<string, unknown>).odds === 'string'
  )
}

export interface AzuroAdapterDeps {
  config: AzuroConfig
  gateway: AzuroGateway
  /** Sin wallet el adaptador sigue sirviendo catálogo y cotizaciones. */
  wallet?: AzuroWalletBridge
  /** Inyectable en tests. Por defecto, el reloj real. */
  now?: () => number
}

export class AzuroAdapter implements MarketSource {
  readonly venue = AZURO_VENUE_ID
  readonly displayName = 'Azuro'
  readonly chainId: number
  readonly capabilities: VenueCapabilities

  private readonly config: AzuroConfig
  private readonly gateway: AzuroGateway
  private readonly wallet: AzuroWalletBridge | null
  private readonly now: () => number

  constructor(deps: AzuroAdapterDeps) {
    this.config = deps.config
    this.gateway = deps.gateway
    this.wallet = deps.wallet ?? null
    this.now = deps.now ?? Date.now
    this.chainId = deps.config.chainId
    this.capabilities = {
      canQuote: true,
      // Sin dirección de afiliado no hay orden válida que firmar.
      canPlaceBet: deps.config.affiliate !== null,
      canReadPositions: true,
      canSubscribe: false,
      canSearch: true,
      canListSubcategories: true,
      canListLeagues: true,
      canRedeem: true,
      canRankPopular: true,
      canCombo: true,
      // El flujo está implementado según el toolkit, pero la API pública aún
      // no sirve las rutas /cashout/* (2026-09-01): hasta entonces las
      // ofertas llegan como null y la UI no enseña nada.
      canCashout: deps.config.cashoutAddress !== null,
    }
  }

  // --- Errores ---------------------------------------------------------------

  private error(kind: VenueErrorKind, message: string, cause?: unknown): VenueError {
    return { kind, message, venue: this.venue, cause }
  }

  private fail<T>(kind: VenueErrorKind, message: string, cause?: unknown): Result<T> {
    return { ok: false, error: this.error(kind, message, cause) }
  }

  private networkFail<T>(operation: string, cause: unknown): Result<T> {
    return this.fail(
      'network',
      `No se pudo obtener ${operation} de Azuro. Comprueba tu conexión e inténtalo de nuevo.`,
      cause,
    )
  }

  private invalidResponseFail<T>(operation: string): Result<T> {
    return this.fail(
      'invalid_response',
      `Azuro devolvió una respuesta inesperada al ${operation}. Inténtalo más tarde.`,
    )
  }

  // --- Listado ----------------------------------------------------------------

  async listMarkets(filter: MarketFilter): Promise<Result<MarketPage>> {
    // Azuro solo sirve deportes: cualquier otra categoría, página vacía sin red.
    if (filter.category !== undefined && filter.category !== 'sports') {
      return { ok: true, data: { markets: [], nextCursor: null } }
    }
    if (filter.venues !== undefined && !filter.venues.includes(this.venue)) {
      return { ok: true, data: { markets: [], nextCursor: null } }
    }

    const query = filter.query?.trim()
    if (query !== undefined && query !== '' && query.length < MIN_SEARCH_LENGTH) {
      // La API exige 3+ caracteres; con menos no hay nada que preguntar.
      return { ok: true, data: { markets: [], nextCursor: null } }
    }

    const page = this.pageFromCursor(filter.cursor)
    if (page === null) {
      return this.fail('unknown', 'Cursor de paginación no reconocido.')
    }

    const byPopularity = filter.orderBy === 'popularity'
    const liveOnly = filter.state === 'live'

    // Búsqueda: rama propia porque su respuesta real NO trae paginación (la
    // doc del toolkit la promete, la API devuelve solo `{ games }`; exigirla
    // convertía toda búsqueda en respuesta inválida). "Hay más" se deduce del
    // tamaño de la página cruda; y como la búsqueda no distingue prematch de
    // en vivo, con `state: 'live'` se criba aquí por el estado del juego.
    if (query !== undefined && query !== '') {
      let raw: unknown
      try {
        raw = await this.gateway.searchGames({
          query,
          page,
          perPage: GAMES_PER_PAGE,
        })
      } catch (cause) {
        return this.networkFail('el listado de mercados', cause)
      }
      const parsed = parseSearchGames(raw)
      if (parsed === null) {
        return this.invalidResponseFail('buscar mercados')
      }
      const games = liveOnly
        ? parsed.value.games.filter((g) => g.state === 'Live')
        : parsed.value.games
      let markets = await this.marketsForGames(games)
      if (markets === null) {
        return this.invalidResponseFail('buscar mercados')
      }
      markets = markets.filter((market) => isListable(market, filter))
      if (filter.limit !== undefined && filter.limit >= 0) {
        markets = markets.slice(0, filter.limit)
      }
      return {
        ok: true,
        data: {
          markets,
          nextCursor:
            parsed.value.rawCount === GAMES_PER_PAGE ? String(page + 1) : null,
        },
      }
    }

    let rawPage: unknown
    try {
      rawPage = await this.gateway.listGames({
        sportSlug: filter.subcategory,
        leagueSlug: filter.league?.id,
        page,
        perPage: GAMES_PER_PAGE,
        orderByTurnover: byPopularity,
        live: liveOnly,
      })
    } catch (cause) {
      return this.networkFail('el listado de mercados', cause)
    }

    const parsedPage = parseGamesPage(rawPage)
    if (parsedPage === null) {
      return this.invalidResponseFail('listar mercados')
    }
    const { totalPages } = parsedPage.value
    // Por popularidad, las ligas top van delante conservando dentro de cada
    // bloque el orden por turnover que ya trae la API.
    let games = byPopularity
      ? [...parsedPage.value.games].sort(
          (a, b) => Number(b.league.isTopLeague) - Number(a.league.isTopLeague),
        )
      : parsedPage.value.games
    // El slug de liga se repite entre países (nueve países tienen una
    // "premier-league") y la API no filtra por país: se refina aquí para no
    // colar jamás mercados de otra liga homónima.
    const leagueCountry = filter.league?.country
    if (leagueCountry !== undefined) {
      games = games.filter((g) => g.country?.name === leagueCountry)
    }

    let markets = await this.marketsForGames(games)
    if (markets === null) {
      return this.invalidResponseFail('listar mercados')
    }

    if (byPopularity) {
      // El orden de los mercados sigue a la respuesta de condiciones, no a la
      // de juegos: se reordena por el rango del juego para que la agrupación
      // en eventos respete la popularidad.
      const rank = new Map(games.map((g, i) => [g.gameId, i]))
      markets = [...markets].sort(
        (a, b) =>
          (rank.get(a.group?.id ?? '') ?? Number.MAX_SAFE_INTEGER) -
          (rank.get(b.group?.id ?? '') ?? Number.MAX_SAFE_INTEGER),
      )
    }

    markets = markets.filter((market) => isListable(market, filter))
    if (filter.limit !== undefined && filter.limit >= 0) {
      markets = markets.slice(0, filter.limit)
    }

    return {
      ok: true,
      data: {
        markets,
        nextCursor: page < totalPages ? String(page + 1) : null,
      },
    }
  }

  async listSubcategories(
    category: MarketCategory,
  ): Promise<Result<Subcategory[]>> {
    // Azuro solo sirve deportes: cualquier otra categoría, lista vacía sin red.
    if (category !== 'sports') return { ok: true, data: [] }

    let raw: unknown
    try {
      raw = await this.gateway.listSports()
    } catch (cause) {
      return this.networkFail('los deportes disponibles', cause)
    }

    const parsed = parseNavigation(raw)
    if (parsed === null) {
      return this.invalidResponseFail('listar los deportes')
    }

    // Solo deportes con partidos prematch, que es lo que lista el catálogo;
    // ordenados por actividad para que los chips relevantes salgan primero.
    const sports = parsed.value
      .filter((s) => (s.activePrematchGamesCount ?? 0) > 0)
      .sort(
        (a, b) =>
          (b.activePrematchGamesCount ?? 0) - (a.activePrematchGamesCount ?? 0),
      )
      .map((s) => ({
        id: s.slug,
        label: s.name,
        activeCount: s.activePrematchGamesCount,
      }))

    return { ok: true, data: sports }
  }

  async listLeagues(
    category: MarketCategory,
    subcategory: string,
  ): Promise<Result<League[]>> {
    // Azuro solo sirve deportes: cualquier otra categoría, lista vacía sin red.
    if (category !== 'sports') return { ok: true, data: [] }

    let raw: unknown
    try {
      raw = await this.gateway.listSports()
    } catch (cause) {
      return this.networkFail('las ligas disponibles', cause)
    }

    const parsed = parseNavigation(raw)
    if (parsed === null) {
      return this.invalidResponseFail('listar las ligas')
    }

    const sport = parsed.value.find((s) => s.slug === subcategory)
    if (sport === undefined) return { ok: true, data: [] }

    // Solo ligas con partidos prematch (lo que lista el catálogo), agrupadas
    // por país en orden alfabético y, dentro, las más activas primero.
    const leagues: League[] = []
    for (const country of sport.countries) {
      for (const league of country.leagues) {
        if ((league.activePrematchGamesCount ?? 0) <= 0) continue
        leagues.push({
          id: league.slug,
          label: league.name,
          country: country.name,
          activeCount: league.activePrematchGamesCount,
        })
      }
    }
    leagues.sort(
      (a, b) =>
        a.country.localeCompare(b.country) ||
        (b.activeCount ?? 0) - (a.activeCount ?? 0),
    )

    return { ok: true, data: leagues }
  }

  private pageFromCursor(cursor: string | undefined): number | null {
    if (cursor === undefined) return 1
    const page = Number(cursor)
    return Number.isInteger(page) && page >= 1 ? page : null
  }

  /** Trae las condiciones de un lote de juegos y las mapea a mercados. */
  private async marketsForGames(games: RawGame[]): Promise<Market[] | null> {
    if (games.length === 0) return []

    let rawConditions: unknown
    try {
      rawConditions = await this.gateway.getConditionsByGameIds(
        games.map((g) => g.gameId),
      )
    } catch {
      return null
    }
    const parsed = parseConditions(rawConditions)
    if (parsed === null) return null

    const gameById = new Map(games.map((g) => [g.gameId, g]))
    const markets: Market[] = []
    for (const condition of parsed.value) {
      const game = gameById.get(condition.gameId)
      if (game === undefined) continue
      markets.push(
        mapConditionToMarket(game, condition, this.venue, this.chainId),
      )
    }
    return markets
  }

  // --- Mercado individual -------------------------------------------------------

  async getMarket(id: string): Promise<Result<Market | null>> {
    const parsed = parseMarketId(id)
    if (parsed === null || parsed.venue !== this.venue) {
      return { ok: true, data: null }
    }
    const native = parseNativeId(parsed.nativeId)
    if (native === null) {
      return { ok: true, data: null }
    }

    let rawGames: unknown
    let rawConditions: unknown
    try {
      ;[rawGames, rawConditions] = await Promise.all([
        this.gateway.getGamesByIds([native.gameId]),
        this.gateway.getConditionsByGameIds([native.gameId]),
      ])
    } catch (cause) {
      return this.networkFail('el mercado', cause)
    }

    const games = parseGames(rawGames)
    const conditions = parseConditions(rawConditions)
    if (games === null || conditions === null) {
      return this.invalidResponseFail('cargar el mercado')
    }

    const game = games.value.find((g) => g.gameId === native.gameId)
    const condition = conditions.value.find(
      (c) => c.conditionId === native.conditionId,
    )
    if (game === undefined || condition === undefined) {
      return { ok: true, data: null }
    }
    return {
      ok: true,
      data: mapConditionToMarket(game, condition, this.venue, this.chainId),
    }
  }

  // --- Cotización ---------------------------------------------------------------

  async getQuote(
    marketId: string,
    outcomeId: string,
    stake: DecimalString,
  ): Promise<Result<Quote>> {
    const ids = this.nativeIdsOf(marketId)
    if (ids === null) {
      return this.fail('not_found', 'El identificador del mercado no es de Azuro.')
    }

    const stakeNumber = Number(stake)
    if (!Number.isFinite(stakeNumber) || stakeNumber <= 0) {
      return this.fail('not_quotable', 'El importe de la apuesta debe ser mayor que cero.')
    }

    // Estado fresco de la condición: la cotizabilidad refleja el estado real
    // de la condición en el protocolo, no un catálogo cacheado.
    let rawStates: unknown
    try {
      rawStates = await this.gateway.getConditionsState([ids.conditionId])
    } catch (cause) {
      return this.networkFail('la cotización', cause)
    }
    const states = parseConditionStates(rawStates)
    if (states === null) {
      return this.invalidResponseFail('cotizar')
    }
    const condition = states.value.find((c) => c.conditionId === ids.conditionId)
    if (condition === undefined) {
      return this.fail('not_found', 'Este mercado ya no existe en Azuro.')
    }
    if (condition.state !== 'Active') {
      return this.fail('not_quotable', 'Este mercado no acepta apuestas ahora mismo.')
    }
    const outcome = condition.outcomes.find((o) => o.outcomeId === outcomeId)
    if (outcome === undefined) {
      return this.fail('not_found', 'Ese resultado no existe en este mercado.')
    }
    const oddsNumber = Number(outcome.odds)
    if (
      outcome.hidden ||
      (outcome.state !== null && outcome.state !== 'Active') ||
      !Number.isFinite(oddsNumber) ||
      oddsNumber <= 1
    ) {
      return this.fail('not_quotable', 'Ese resultado no tiene cotización ahora mismo.')
    }

    // Límites del protocolo para esta selección.
    let rawCalc: unknown
    try {
      rawCalc = await this.gateway.getBetCalculation(
        [{ conditionId: ids.conditionId, outcomeId }],
        undefined,
      )
    } catch (cause) {
      return this.networkFail('los límites de apuesta', cause)
    }
    const calc = parseBetCalculation(rawCalc)
    if (calc === null) {
      return this.invalidResponseFail('calcular los límites de apuesta')
    }
    if (calc.minBet !== null && stakeNumber < calc.minBet) {
      return this.fail(
        'not_quotable',
        `La apuesta mínima en este mercado es ${calc.minBet} ${this.config.betToken.symbol}.`,
      )
    }
    if (stakeNumber > calc.maxBet) {
      return this.fail(
        'not_quotable',
        `La apuesta máxima en este mercado es ${calc.maxBet} ${this.config.betToken.symbol}.`,
      )
    }

    // Pago esperado con aritmética entera: stake × cuota, sin coma flotante.
    const { decimals } = this.config.betToken
    let expectedPayout: DecimalString
    try {
      const stakeUnits = parseUnits(stake, decimals)
      const oddsUnits = parseUnits(outcome.odds, ODDS_DECIMALS)
      const payoutUnits = (stakeUnits * oddsUnits) / 10n ** BigInt(ODDS_DECIMALS)
      expectedPayout = toDecimal(formatUnits(payoutUnits, decimals))
    } catch (cause) {
      return this.fail('unknown', 'No se pudo calcular el pago esperado.', cause)
    }

    const venueData: AzuroQuoteData = {
      conditionId: ids.conditionId,
      outcomeId,
      odds: outcome.odds,
    }
    return {
      ok: true,
      data: {
        marketId,
        outcomeId,
        stake,
        expectedPayout,
        // El vAMM de Azuro cotiza una cuota firme para la orden; no expone un
        // desglose de impacto por tamaño en esta API.
        priceImpact: null,
        expiresAt: null,
        venueData,
      },
    }
  }

  private nativeIdsOf(
    marketId: string,
  ): { gameId: string; conditionId: string } | null {
    const parsed = parseMarketId(marketId)
    if (parsed === null || parsed.venue !== this.venue) return null
    return parseNativeId(parsed.nativeId)
  }

  // --- Combinadas -----------------------------------------------------------------

  async getComboQuote(
    selections: ComboSelection[],
    stake: DecimalString,
  ): Promise<Result<ComboQuote>> {
    if (selections.length < 2) {
      return this.fail(
        'not_quotable',
        'Una combinada necesita al menos dos selecciones.',
      )
    }
    const stakeNumber = Number(stake)
    if (!Number.isFinite(stakeNumber) || stakeNumber <= 0) {
      return this.fail('not_quotable', 'El importe de la apuesta debe ser mayor que cero.')
    }

    // Cada selección debe ser de este venue, y de PARTIDOS distintos: el
    // protocolo no combina dos mercados del mismo juego.
    const legs: { gameId: string; conditionId: string; outcomeId: string }[] = []
    for (const s of selections) {
      const ids = this.nativeIdsOf(s.marketId)
      if (ids === null) {
        return this.fail('not_found', 'Hay una selección que no es de Azuro.')
      }
      legs.push({ ...ids, outcomeId: s.outcomeId })
    }
    if (new Set(legs.map((l) => l.gameId)).size !== legs.length) {
      return this.fail(
        'not_quotable',
        'Las selecciones de una combinada deben ser de partidos distintos.',
      )
    }
    if (new Set(legs.map((l) => l.conditionId)).size !== legs.length) {
      return this.fail(
        'not_quotable',
        'Hay dos selecciones del mismo mercado en la combinada.',
      )
    }

    // Estado fresco de TODAS las condiciones: si una pata no cotiza, la
    // combinada entera no cotiza.
    let rawStates: unknown
    try {
      rawStates = await this.gateway.getConditionsState(
        legs.map((l) => l.conditionId),
      )
    } catch (cause) {
      return this.networkFail('la cotización de la combinada', cause)
    }
    const states = parseConditionStates(rawStates)
    if (states === null) {
      return this.invalidResponseFail('cotizar la combinada')
    }

    const quotedLegs: AzuroComboQuoteData['legs'] = []
    for (const leg of legs) {
      const condition = states.value.find((c) => c.conditionId === leg.conditionId)
      if (condition === undefined) {
        return this.fail('not_found', 'Una de las selecciones ya no existe en Azuro.')
      }
      if (condition.state !== 'Active') {
        return this.fail(
          'not_quotable',
          'Una de las selecciones no acepta apuestas ahora mismo.',
        )
      }
      const outcome = condition.outcomes.find((o) => o.outcomeId === leg.outcomeId)
      const oddsNumber = outcome === undefined ? NaN : Number(outcome.odds)
      if (
        outcome === undefined ||
        outcome.hidden ||
        (outcome.state !== null && outcome.state !== 'Active') ||
        !Number.isFinite(oddsNumber) ||
        oddsNumber <= 1
      ) {
        return this.fail(
          'not_quotable',
          'Una de las selecciones no tiene cotización ahora mismo.',
        )
      }
      quotedLegs.push({
        conditionId: leg.conditionId,
        outcomeId: leg.outcomeId,
        odds: outcome.odds,
      })
    }

    // Límites del protocolo para la combinada completa. Aquí es donde Azuro
    // rechaza también las combinaciones vetadas (mercados no combinables).
    let rawCalc: unknown
    try {
      rawCalc = await this.gateway.getBetCalculation(
        quotedLegs.map((l) => ({
          conditionId: l.conditionId,
          outcomeId: l.outcomeId,
        })),
        undefined,
      )
    } catch (cause) {
      return this.networkFail('los límites de la combinada', cause)
    }
    const calc = parseBetCalculation(rawCalc)
    if (calc === null) {
      return this.invalidResponseFail('calcular los límites de la combinada')
    }
    if (calc.minBet !== null && stakeNumber < calc.minBet) {
      return this.fail(
        'not_quotable',
        `La apuesta mínima para esta combinada es ${calc.minBet} ${this.config.betToken.symbol}.`,
      )
    }
    if (stakeNumber > calc.maxBet) {
      return this.fail(
        'not_quotable',
        `La apuesta máxima para esta combinada es ${calc.maxBet} ${this.config.betToken.symbol}.`,
      )
    }

    // Cuota total y pago con aritmética entera: producto de cuotas escaladas
    // a 12 decimales, sin coma flotante.
    const { decimals } = this.config.betToken
    const oddsScale = 10n ** BigInt(ODDS_DECIMALS)
    let totalOdds: DecimalString
    let expectedPayout: DecimalString
    try {
      let totalOddsUnits = oddsScale
      for (const leg of quotedLegs) {
        totalOddsUnits =
          (totalOddsUnits * parseUnits(leg.odds, ODDS_DECIMALS)) / oddsScale
      }
      totalOdds = toDecimal(formatUnits(totalOddsUnits, ODDS_DECIMALS))
      const stakeUnits = parseUnits(stake, decimals)
      expectedPayout = toDecimal(
        formatUnits((stakeUnits * totalOddsUnits) / oddsScale, decimals),
      )
    } catch (cause) {
      return this.fail('unknown', 'No se pudo calcular el pago de la combinada.', cause)
    }

    const venueData: AzuroComboQuoteData = { legs: quotedLegs, totalOdds }
    return {
      ok: true,
      data: {
        selections,
        stake,
        totalOdds,
        expectedPayout,
        expiresAt: null,
        venueData,
      },
    }
  }

  async placeComboBet(
    quote: ComboQuote,
    opts: BetOptions,
  ): Promise<Result<ComboBetReceipt>> {
    const affiliate = this.config.affiliate
    if (affiliate === null) {
      return this.fail(
        'unsupported',
        'Este despliegue no tiene configurada la dirección de afiliado de Azuro (VITE_AZURO_AFFILIATE_ADDRESS), así que no puede colocar apuestas.',
      )
    }
    if (this.wallet === null) {
      return this.fail('wallet', 'Conecta una wallet para apostar.')
    }
    if (!isAddress(opts.from)) {
      return this.fail('wallet', 'La dirección de la wallet no es válida.')
    }
    if (!isAzuroComboQuoteData(quote.venueData)) {
      return this.fail(
        'invalid_response',
        'La cotización no contiene los datos de Azuro. Vuelve a cotizar antes de apostar.',
      )
    }
    if (
      opts.slippageTolerance < 0 ||
      opts.slippageTolerance >= 1 ||
      !Number.isFinite(opts.slippageTolerance)
    ) {
      return this.fail('unknown', 'La tolerancia de slippage debe estar entre 0 y 1.')
    }
    const { legs, totalOdds } = quote.venueData

    let rawFee: unknown
    try {
      rawFee = await this.gateway.getBetFee()
    } catch (cause) {
      return this.networkFail('la tarifa del relayer', cause)
    }
    const fee = parseBetFee(rawFee)
    if (fee === null) {
      return this.invalidResponseFail('obtener la tarifa del relayer')
    }

    const { decimals, address: tokenAddress } = this.config.betToken
    let amount: bigint
    try {
      amount = parseUnits(quote.stake, decimals)
    } catch (cause) {
      return this.fail('unknown', 'El importe de la apuesta no es válido.', cause)
    }
    if (amount <= 0n) {
      return this.fail('not_quotable', 'El importe de la apuesta debe ser mayor que cero.')
    }

    try {
      const required = amount + BigInt(fee.relayerFeeAmount)
      const current = await this.wallet.readAllowance(
        tokenAddress,
        opts.from,
        this.config.relayerAddress,
      )
      if (current < required) {
        await this.wallet.approve(tokenAddress, this.config.relayerAddress, required)
      }
    } catch (cause) {
      return this.walletFail('No se pudo aprobar el gasto del token de apuesta.', cause)
    }

    // La cuota mínima aceptada se aplica sobre la cuota COMBINADA: el
    // slippage tolera el movimiento del producto, no de cada pata.
    const totalOddsNumber = Number(totalOdds)
    if (!Number.isFinite(totalOddsNumber) || totalOddsNumber <= 1) {
      return this.fail('not_quotable', 'La cotización ya no es válida. Vuelve a cotizar.')
    }
    const minOdds = parseUnits(
      calcMinOdds({ odds: totalOddsNumber, slippage: opts.slippageTolerance * 100 }),
      ODDS_DECIMALS,
    )

    const nowMs = this.now()
    const clientData = {
      attention: '',
      affiliate,
      core: this.config.coreAddress,
      expiresAt: Math.floor((nowMs + (opts.deadlineMs ?? DEFAULT_BET_DEADLINE_MS)) / 1000),
      chainId: this.config.chainId,
      relayerFeeAmount: fee.relayerFeeAmount,
      isFeeSponsored: false,
      isBetSponsored: false,
      isSponsoredBetReturnable: false,
    }
    const bets = legs.map((leg) => ({
      conditionId: leg.conditionId,
      outcomeId: leg.outcomeId,
    }))

    let signature: Hex
    try {
      signature = await this.wallet.signComboBetTypedData(
        getComboBetTypedData({
          account: opts.from as Address,
          clientData,
          bets,
          amount: String(amount),
          minOdds: String(minOdds),
          nonce: String(nowMs),
        }),
      )
    } catch (cause) {
      return this.walletFail('No se pudo firmar la combinada.', cause)
    }

    let rawResponse: unknown
    try {
      rawResponse = await this.gateway.submitComboBet({
        account: opts.from as Address,
        clientData,
        bets,
        amount: String(amount),
        minOdds: String(minOdds),
        nonce: String(nowMs),
        signature,
      })
    } catch (cause) {
      return this.networkFail('el envío de la combinada', cause)
    }
    const response = parseCreateBetResponse(rawResponse)
    if (response === null) {
      return this.invalidResponseFail('enviar la combinada')
    }
    if (response.state === 'Rejected' || response.state === 'Canceled') {
      return this.fail(
        'not_quotable',
        response.errorMessage ??
          'Azuro rechazó la combinada. Vuelve a cotizar e inténtalo de nuevo.',
      )
    }

    return {
      ok: true,
      data: {
        selections: quote.selections,
        stake: quote.stake,
        reference: response.id,
        explorerUrl: null,
        placedAt: new Date(nowMs),
        status: response.state === 'Accepted' ? 'confirmed' : 'pending',
      },
    }
  }

  // --- Colocación ----------------------------------------------------------------

  async placeBet(quote: Quote, opts: BetOptions): Promise<Result<BetReceipt>> {
    const affiliate = this.config.affiliate
    if (affiliate === null) {
      return this.fail(
        'unsupported',
        'Este despliegue no tiene configurada la dirección de afiliado de Azuro (VITE_AZURO_AFFILIATE_ADDRESS), así que no puede colocar apuestas.',
      )
    }
    if (this.wallet === null) {
      return this.fail('wallet', 'Conecta una wallet para apostar.')
    }
    if (!isAddress(opts.from)) {
      return this.fail('wallet', 'La dirección de la wallet no es válida.')
    }
    if (!isAzuroQuoteData(quote.venueData)) {
      return this.fail(
        'invalid_response',
        'La cotización no contiene los datos de Azuro. Vuelve a cotizar antes de apostar.',
      )
    }
    if (
      opts.slippageTolerance < 0 ||
      opts.slippageTolerance >= 1 ||
      !Number.isFinite(opts.slippageTolerance)
    ) {
      return this.fail('unknown', 'La tolerancia de slippage debe estar entre 0 y 1.')
    }
    const { conditionId, outcomeId, odds } = quote.venueData

    // 1. Tarifa del relayer (paga la transacción on-chain por el usuario).
    let rawFee: unknown
    try {
      rawFee = await this.gateway.getBetFee()
    } catch (cause) {
      return this.networkFail('la tarifa del relayer', cause)
    }
    const fee = parseBetFee(rawFee)
    if (fee === null) {
      return this.invalidResponseFail('obtener la tarifa del relayer')
    }

    // 2. Importes en unidades del token.
    const { decimals, address: tokenAddress } = this.config.betToken
    let amount: bigint
    try {
      amount = parseUnits(quote.stake, decimals)
    } catch (cause) {
      return this.fail('unknown', 'El importe de la apuesta no es válido.', cause)
    }
    if (amount <= 0n) {
      return this.fail('not_quotable', 'El importe de la apuesta debe ser mayor que cero.')
    }
    const relayerFee = BigInt(fee.relayerFeeAmount)

    // 3. Allowance hacia el relayer (cubre apuesta + tarifa).
    try {
      const required = amount + relayerFee
      const current = await this.wallet.readAllowance(
        tokenAddress,
        opts.from,
        this.config.relayerAddress,
      )
      if (current < required) {
        await this.wallet.approve(tokenAddress, this.config.relayerAddress, required)
      }
    } catch (cause) {
      return this.walletFail('No se pudo aprobar el gasto del token de apuesta.', cause)
    }

    // 4. Cuota mínima aceptada = cuota cotizada menos el slippage tolerado,
    //    escalada al formato del contrato (12 decimales).
    const oddsNumber = Number(odds)
    if (!Number.isFinite(oddsNumber) || oddsNumber <= 1) {
      return this.fail('not_quotable', 'La cotización ya no es válida. Vuelve a cotizar.')
    }
    const minOdds = parseUnits(
      calcMinOdds({ odds: oddsNumber, slippage: opts.slippageTolerance * 100 }),
      ODDS_DECIMALS,
    )

    const nowMs = this.now()
    const clientData = {
      attention: '',
      affiliate,
      core: this.config.coreAddress,
      expiresAt: Math.floor((nowMs + (opts.deadlineMs ?? DEFAULT_BET_DEADLINE_MS)) / 1000),
      chainId: this.config.chainId,
      relayerFeeAmount: fee.relayerFeeAmount,
      isFeeSponsored: false,
      isBetSponsored: false,
      isSponsoredBetReturnable: false,
    }
    const bet = {
      conditionId,
      outcomeId,
      minOdds: String(minOdds),
      amount: String(amount),
      nonce: String(nowMs),
    }

    // 5. Firma EIP-712 y envío de la orden al relayer.
    let signature: Hex
    try {
      signature = await this.wallet.signBetTypedData(
        getBetTypedData({ account: opts.from as Address, clientData, bet }),
      )
    } catch (cause) {
      return this.walletFail('No se pudo firmar la apuesta.', cause)
    }

    let rawResponse: unknown
    try {
      rawResponse = await this.gateway.submitBet({
        account: opts.from as Address,
        clientData,
        bet,
        signature,
      })
    } catch (cause) {
      return this.networkFail('el envío de la apuesta', cause)
    }
    const response = parseCreateBetResponse(rawResponse)
    if (response === null) {
      return this.invalidResponseFail('enviar la apuesta')
    }

    if (response.state === 'Rejected' || response.state === 'Canceled') {
      return this.fail(
        'not_quotable',
        response.errorMessage ?? 'Azuro rechazó la apuesta. Vuelve a cotizar e inténtalo de nuevo.',
      )
    }

    return {
      ok: true,
      data: {
        marketId: quote.marketId,
        outcomeId: quote.outcomeId,
        stake: quote.stake,
        // La orden aún no tiene hash on-chain: la referencia es el id de la
        // orden del relayer, consultable después con getBetsByBettor.
        reference: response.id,
        explorerUrl: null,
        placedAt: new Date(nowMs),
        status: response.state === 'Accepted' ? 'confirmed' : 'pending',
      },
    }
  }

  // --- Cobro -----------------------------------------------------------------

  async redeemPosition(
    position: Position,
    opts: { from: string },
  ): Promise<Result<RedeemReceipt>> {
    if (this.wallet === null) {
      return this.fail('wallet', 'Conecta una wallet para cobrar.')
    }
    if (!isAddress(opts.from)) {
      return this.fail('wallet', 'La dirección de la wallet no es válida.')
    }
    if (position.status !== 'redeemable') {
      return this.fail('not_quotable', 'Esta posición no está lista para cobrar.')
    }
    if (!isAzuroPositionData(position.venueData)) {
      return this.fail(
        'invalid_response',
        'La posición no trae los datos de cobro de Azuro. Recarga tus posiciones e inténtalo de nuevo.',
      )
    }
    const { betId, core } = position.venueData
    if (!isAddress(core) || !Number.isInteger(betId) || betId <= 0) {
      return this.fail(
        'invalid_response',
        'Los datos de cobro de la posición no son válidos.',
      )
    }

    // El LP es constante verificada del toolkit; el core viaja por apuesta y
    // el propio LP lo valida on-chain (revierte con un core desconocido).
    let txHash: Hex
    try {
      txHash = await this.wallet.withdrawPayout(
        this.config.lpAddress,
        core,
        BigInt(betId),
      )
    } catch (cause) {
      return this.walletFail('No se pudo cobrar la posición.', cause)
    }

    return {
      ok: true,
      data: {
        positionId: position.id,
        reference: txHash,
        explorerUrl:
          this.config.explorerBase !== null
            ? `${this.config.explorerBase}/tx/${txHash}`
            : null,
        redeemedAt: new Date(this.now()),
      },
    }
  }

  // --- Cash out ----------------------------------------------------------------

  /**
   * Oferta de cash out para una posición abierta. `null` cuando Azuro no
   * ofrece cerrar esa apuesta ahora (o cuando el servicio no está desplegado:
   * el toolkit convierte el 404 en null, así que hoy TODAS las consultas
   * devuelven null — ver el comentario de `canCashout`).
   */
  async getCashoutOffer(
    position: Position,
    opts: { from: string },
  ): Promise<Result<CashoutOffer | null>> {
    if (this.config.cashoutAddress === null) {
      return this.fail(
        'unsupported',
        'Esta red de Azuro no tiene contrato de cash out.',
      )
    }
    if (!isAddress(opts.from)) {
      return this.fail('wallet', 'La dirección de la wallet no es válida.')
    }
    if (position.status !== 'open') {
      return { ok: true, data: null }
    }
    if (!isAzuroPositionData(position.venueData)) {
      return this.fail(
        'invalid_response',
        'La posición no trae los datos de Azuro. Recarga tus posiciones.',
      )
    }
    const { betId, core } = position.venueData

    // Identificador de apuesta del grafo de Azuro: `{core}_{tokenId}` en
    // minúsculas (la convención de su subgraph, que el endpoint hereda).
    const graphBetId = `${core.toLowerCase()}_${betId}`

    let raw: unknown
    try {
      raw = await this.gateway.getCashoutCalculation(
        opts.from as Address,
        graphBetId,
      )
    } catch (cause) {
      return this.networkFail('la oferta de cash out', cause)
    }
    if (raw === null) {
      return { ok: true, data: null }
    }
    const calc = parseCashoutCalculation(raw)
    if (calc === null) {
      return this.invalidResponseFail('calcular el cash out')
    }

    let amount: DecimalString
    try {
      amount = toDecimal(calc.cashoutAmount)
    } catch (cause) {
      return this.fail(
        'invalid_response',
        'El importe del cash out no es válido.',
        cause,
      )
    }

    const venueData: AzuroCashoutData = {
      calculationId: calc.calculationId,
      tokenId: calc.tokenId,
      cashoutOdds: calc.cashoutOdds,
      expiredAt: calc.expiredAt,
    }
    return {
      ok: true,
      data: {
        positionId: position.id,
        amount,
        // `expiredAt` llega en segundos (formato del typed data); un valor ya
        // en milisegundos se detecta por magnitud y no se multiplica de más.
        expiresAt: new Date(
          calc.expiredAt > 1e12 ? calc.expiredAt : calc.expiredAt * 1000,
        ),
        venueData,
      },
    }
  }

  /**
   * Ejecuta una oferta de cash out: aprueba el NFT AzuroBet al contrato de
   * cash out si hace falta, firma la orden EIP-712 y la envía a la API.
   */
  async cashoutPosition(
    offer: CashoutOffer,
    opts: { from: string },
  ): Promise<Result<CashoutReceipt>> {
    const cashoutAddress = this.config.cashoutAddress
    if (cashoutAddress === null) {
      return this.fail(
        'unsupported',
        'Esta red de Azuro no tiene contrato de cash out.',
      )
    }
    if (this.wallet === null) {
      return this.fail('wallet', 'Conecta una wallet para hacer cash out.')
    }
    if (!isAddress(opts.from)) {
      return this.fail('wallet', 'La dirección de la wallet no es válida.')
    }
    if (!isAzuroCashoutData(offer.venueData)) {
      return this.fail(
        'invalid_response',
        'La oferta no contiene los datos de Azuro. Vuelve a pedir la oferta.',
      )
    }
    const { calculationId, tokenId, cashoutOdds, expiredAt } = offer.venueData
    if (expiredAt * 1000 <= this.now()) {
      return this.fail(
        'not_quotable',
        'La oferta de cash out ha caducado. Pide una nueva.',
      )
    }

    // El contrato de cash out transfiere el NFT de la apuesta: necesita la
    // aprobación del usuario sobre sus AzuroBet (una vez por wallet).
    try {
      const approved = await this.wallet.isApprovedForAll(
        this.config.azuroBetAddress,
        opts.from as Address,
        cashoutAddress,
      )
      if (!approved) {
        await this.wallet.setApprovalForAll(
          this.config.azuroBetAddress,
          cashoutAddress,
        )
      }
    } catch (cause) {
      return this.walletFail(
        'No se pudo aprobar el NFT de la apuesta para el cash out.',
        cause,
      )
    }

    let signature: Hex
    try {
      signature = await this.wallet.signCashoutTypedData(
        getCashoutTypedData({
          chainId: this.config.chainId as ChainId,
          account: opts.from as Address,
          attention: CASHOUT_ATTENTION,
          tokenId,
          cashoutOdds,
          expiredAt,
        }),
      )
    } catch (cause) {
      return this.walletFail('No se pudo firmar el cash out.', cause)
    }

    let rawResponse: unknown
    try {
      rawResponse = await this.gateway.submitCashout({
        calculationId,
        attention: CASHOUT_ATTENTION,
        signature,
      })
    } catch (cause) {
      return this.networkFail('el envío del cash out', cause)
    }
    const response = parseCashoutResponse(rawResponse)
    if (response === null) {
      return this.invalidResponseFail('enviar el cash out')
    }
    if (response.state === 'REJECTED') {
      return this.fail(
        'not_quotable',
        response.errorMessage ??
          'Azuro rechazó el cash out. Pide una oferta nueva e inténtalo otra vez.',
      )
    }

    return {
      ok: true,
      data: {
        positionId: offer.positionId,
        amount: offer.amount,
        reference: response.id,
        explorerUrl: null,
        cashedOutAt: new Date(this.now()),
      },
    }
  }

  /** Distingue el rechazo del usuario del resto de fallos de wallet. */
  private walletFail<T>(message: string, cause: unknown): Result<T> {
    const rejected =
      typeof cause === 'object' &&
      cause !== null &&
      (('code' in cause && (cause as { code: unknown }).code === 4001) ||
        ('name' in cause &&
          (cause as { name: unknown }).name === 'UserRejectedRequestError'))
    if (rejected) {
      return this.fail('rejected', 'Has cancelado la firma en la wallet.', cause)
    }
    return this.fail('wallet', message, cause)
  }

  // --- Posiciones ------------------------------------------------------------------

  async getPositions(address: string): Promise<Result<Position[]>> {
    if (!isAddress(address)) {
      return this.fail('wallet', 'La dirección de la wallet no es válida.')
    }

    let rawOrders: unknown
    try {
      rawOrders = await this.gateway.getBetsByBettor(address)
    } catch (cause) {
      return this.networkFail('tus posiciones', cause)
    }
    const orders = parseBetOrders(rawOrders)
    if (orders === null) {
      return this.invalidResponseFail('cargar tus posiciones')
    }

    // Etiquetas desnormalizadas: título del partido para cada posición.
    const gameIds = [
      ...new Set(
        orders.value.flatMap((o) => o.conditions.map((c) => c.gameId)),
      ),
    ]
    const gameTitleByGameId = new Map<string, string>()
    if (gameIds.length > 0) {
      try {
        const games = parseGames(await this.gateway.getGamesByIds(gameIds))
        if (games !== null) {
          for (const game of games.value) {
            gameTitleByGameId.set(game.gameId, game.title)
          }
        }
        // Si los títulos no llegan, las posiciones salen igualmente con la
        // etiqueta del mercado: no bloqueamos la cartera por un adorno.
      } catch {
        // Ídem: fallo de red al decorar no invalida las posiciones.
      }
    }

    const positions: Position[] = []
    for (const order of orders.value) {
      const position = mapOrderToPosition(order, gameTitleByGameId, this.venue)
      if (position !== null) positions.push(position)
    }
    return { ok: true, data: positions }
  }
}
