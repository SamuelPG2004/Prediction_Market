/**
 * Adaptador de Azuro: implementa el puerto `MarketSource` del dominio.
 *
 * Deportes en Polygon (por defecto). Descubrimiento y cotización contra el
 * Backend API oficial; colocación de apuestas vía relayer con firma EIP-712.
 * La UI no ve nada de esto: solo el dominio.
 *
 * Alcance de la Fase 2 (documentado, no accidental):
 *  - Se listan juegos PREMATCH. El feed en vivo (websocket) queda para cuando
 *    haya suscripciones (`canSubscribe: false`).
 *  - Solo apuestas simples (ordinar); las combinadas no existen en el dominio.
 */
import {
  ODDS_DECIMALS,
  calcMinOdds,
  getBetTypedData,
} from '@azuro-org/toolkit'
import { isAddress, parseUnits, formatUnits, type Address, type Hex } from 'viem'
import {
  isListable,
  parseMarketId,
  toDecimal,
  type BetOptions,
  type BetReceipt,
  type DecimalString,
  type Market,
  type MarketFilter,
  type MarketPage,
  type MarketSource,
  type Position,
  type Quote,
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
  parseConditionStates,
  parseConditions,
  parseCreateBetResponse,
  parseGames,
  parseGamesPage,
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

    let rawPage: unknown
    try {
      rawPage =
        query !== undefined && query !== ''
          ? await this.gateway.searchGames({
              query,
              page,
              perPage: GAMES_PER_PAGE,
            })
          : await this.gateway.listGames({
              sportSlug: filter.subcategory,
              page,
              perPage: GAMES_PER_PAGE,
            })
    } catch (cause) {
      return this.networkFail('el listado de mercados', cause)
    }

    const parsedPage = parseGamesPage(rawPage)
    if (parsedPage === null) {
      return this.invalidResponseFail('listar mercados')
    }
    const { games, totalPages } = parsedPage.value

    let markets = await this.marketsForGames(games)
    if (markets === null) {
      return this.invalidResponseFail('listar mercados')
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
        { conditionId: ids.conditionId, outcomeId },
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
