/**
 * Adaptador de Limitless: implementa el puerto `MarketSource` del dominio.
 *
 * Mercados no deportivos en Base (8453), colateral USDC, order book central
 * (CLOB). Descubrimiento y cotización contra la API REST pública; colocación
 * de órdenes FAK firmadas EIP-712 con autenticación HMAC de token API.
 *
 * Alcance de la Fase 3 (documentado, no accidental):
 *  - Solo mercados CLOB (simples y grupos negRisk). Los AMM heredados usan
 *    otra escala de precios y otra ejecución; se descartan al mapear.
 *  - Solo compra de resultados (`side: BUY`), que es lo que expone el puerto.
 *  - Sin feed en vivo (`canSubscribe: false`).
 *  - Deportes excluidos por defecto: el plan asigna deportes a Azuro
 *    (configurable con `includeSports`).
 */
import { getAddress, isAddress, parseUnits, formatUnits, type Address, type Hex } from 'viem'
import {
  isListable,
  parseMarketId,
  toDecimal,
  type BetOptions,
  type BetReceipt,
  type DecimalString,
  type Market,
  type MarketCategory,
  type MarketFilter,
  type MarketPage,
  type MarketSource,
  type Position,
  type Quote,
  type RedeemReceipt,
  type Result,
  type Subcategory,
  type VenueCapabilities,
  type VenueError,
  type VenueErrorKind,
} from '../../domain/types.ts'
import { buyLevels, limitPriceMilli, priceImpactOf, sizeFakBuy, walkBuy } from './book.ts'
import type { LimitlessConfig } from './config.ts'
import {
  buildOrderTypedData,
  limitlessErrorMessage,
  LimitlessHttpError,
  type LimitlessGateway,
  type LimitlessSignedOrder,
  type LimitlessWalletBridge,
} from './gateway.ts'
import {
  mapClobPositionToDomain,
  mapGroupToDomain,
  mapMarketToDomain,
  mapStatus,
} from './mappers.ts'
import {
  parseActivePage,
  parseClobPositions,
  parseCreateOrderResponse,
  parseMarket,
  parseOrderbook,
  parseProfile,
  parseSearchPage,
  type RawListingPage,
} from './validate.ts'

export const LIMITLESS_VENUE_ID = 'limitless'

/** Máximo que admite la API por página. */
const PAGE_LIMIT = 25

/**
 * La API no filtra por categoría en servidor (cualquier parámetro de filtro
 * devuelve 400), así que se filtra aquí, en cliente, página a página. Con el
 * catálogo dominado por deporte y cripto, una categoría minoritaria puede
 * tardar muchas páginas en asomar: una llamada a `listMarkets` encadena hasta
 * este número de peticiones antes de devolver lo que haya; el cursor permite
 * a la siguiente llamada continuar donde se quedó.
 */
const MAX_PAGES_PER_LIST_CALL = 5
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address

/**
 * Cursor compuesto: primero se pagina el listado de mercados simples (clob)
 * y al agotarse se continúa con los grupos negRisk. `search:` pagina una
 * búsqueda. El formato es interno del adaptador; la UI lo trata como opaco.
 */
type Cursor =
  | { kind: 'clob' | 'group'; page: number }
  | { kind: 'search'; page: number }

function parseCursor(cursor: string | undefined, hasQuery: boolean): Cursor | null {
  if (cursor === undefined) {
    return hasQuery ? { kind: 'search', page: 1 } : { kind: 'clob', page: 1 }
  }
  const match = /^(clob|group|search):(\d+)$/.exec(cursor)
  if (match === null) return null
  const kind = match[1] as Cursor['kind']
  const page = Number(match[2])
  if (page < 1) return null
  if (hasQuery !== (kind === 'search')) return null
  return { kind, page }
}

/** Contenido de `Quote.venueData` para Limitless. Solo este adaptador lo lee. */
interface LimitlessQuoteData {
  slug: string
  outcome: 'yes' | 'no'
  /** Id ERC-1155 de la posición comprada. */
  tokenId: string
  /** Peor precio consumido al cotizar, en milésimas. Base del límite FAK. */
  worstPriceMilli: number
  /** El mercado cobra comisión de taker (exige feeRateBps del perfil). */
  feeMarket: boolean
  exchange: string
  collateralAddress: string
  collateralDecimals: number
}

function isLimitlessQuoteData(u: unknown): u is LimitlessQuoteData {
  if (typeof u !== 'object' || u === null) return false
  const d = u as Record<string, unknown>
  return (
    typeof d.slug === 'string' &&
    (d.outcome === 'yes' || d.outcome === 'no') &&
    typeof d.tokenId === 'string' &&
    typeof d.worstPriceMilli === 'number' &&
    typeof d.feeMarket === 'boolean' &&
    typeof d.exchange === 'string' &&
    typeof d.collateralAddress === 'string' &&
    typeof d.collateralDecimals === 'number'
  )
}

export interface LimitlessAdapterDeps {
  config: LimitlessConfig
  gateway: LimitlessGateway
  /** Sin wallet el adaptador sigue sirviendo catálogo y cotizaciones. */
  wallet?: LimitlessWalletBridge
  /** Inyectable en tests. Por defecto, el reloj real. */
  now?: () => number
}

export class LimitlessAdapter implements MarketSource {
  readonly venue = LIMITLESS_VENUE_ID
  readonly displayName = 'Limitless'
  readonly chainId: number
  readonly capabilities: VenueCapabilities

  private readonly config: LimitlessConfig
  private readonly gateway: LimitlessGateway
  private readonly wallet: LimitlessWalletBridge | null
  private readonly now: () => number

  constructor(deps: LimitlessAdapterDeps) {
    this.config = deps.config
    this.gateway = deps.gateway
    this.wallet = deps.wallet ?? null
    this.now = deps.now ?? Date.now
    this.chainId = deps.config.chainId
    const hasAuth = deps.config.auth !== null
    this.capabilities = {
      canQuote: true,
      // Órdenes y cartera exigen el token API con firma HMAC.
      canPlaceBet: hasAuth,
      canReadPositions: hasAuth,
      canSubscribe: false,
      canSearch: true,
      // La API no expone un listado de subcategorías activas.
      canListSubcategories: false,
      // La API pública no expone un orden por volumen utilizable; antes que
      // fingir popularidad con el orden por defecto: no se ofrece.
      canRankPopular: false,
      // El cobro CTF (redeemPositions del condicional) queda fuera de alcance.
      canRedeem: false,
    }
  }

  // --- Errores -------------------------------------------------------------------

  private error(kind: VenueErrorKind, message: string, cause?: unknown): VenueError {
    return { kind, message, venue: this.venue, cause }
  }

  private fail<T>(kind: VenueErrorKind, message: string, cause?: unknown): Result<T> {
    return { ok: false, error: this.error(kind, message, cause) }
  }

  private networkFail<T>(operation: string, cause: unknown): Result<T> {
    return this.fail(
      'network',
      `No se pudo obtener ${operation} de Limitless. Comprueba tu conexión e inténtalo de nuevo.`,
      cause,
    )
  }

  private invalidResponseFail<T>(operation: string): Result<T> {
    return this.fail(
      'invalid_response',
      `Limitless devolvió una respuesta inesperada al ${operation}. Inténtalo más tarde.`,
    )
  }

  // --- Listado --------------------------------------------------------------------

  async listMarkets(filter: MarketFilter): Promise<Result<MarketPage>> {
    if (filter.venues !== undefined && !filter.venues.includes(this.venue)) {
      return { ok: true, data: { markets: [], nextCursor: null } }
    }
    // Deportes: por plan de venues los sirve Azuro; aquí solo si se configura.
    if (filter.category === 'sports' && !this.config.includeSports) {
      return { ok: true, data: { markets: [], nextCursor: null } }
    }

    const query = filter.query?.trim() ?? ''
    let cursor = parseCursor(filter.cursor, query !== '')
    if (cursor === null) {
      return this.fail('unknown', 'Cursor de paginación no reconocido.')
    }

    const collected: Market[] = []
    let next: string | null = null

    // El filtrado es en cliente: una página entera puede quedar vacía tras
    // filtrar. Se encadenan páginas hasta encontrar algo (o agotar el tope)
    // para que una categoría minoritaria no parezca vacía solo por estar lejos.
    for (let fetched = 0; fetched < MAX_PAGES_PER_LIST_CALL; fetched++) {
      let rawPage: unknown
      try {
        rawPage =
          cursor.kind === 'search'
            ? await this.gateway.searchMarkets({
                query,
                page: cursor.page,
                limit: PAGE_LIMIT,
              })
            : await this.gateway.listActiveMarkets({
                tradeType: cursor.kind,
                page: cursor.page,
                limit: PAGE_LIMIT,
              })
      } catch (cause) {
        return this.networkFail('el listado de mercados', cause)
      }

      const parsed =
        cursor.kind === 'search' ? parseSearchPage(rawPage) : parseActivePage(rawPage)
      if (parsed === null) {
        return this.invalidResponseFail('listar mercados')
      }

      const markets = this.mapListing(parsed.value).filter((market) => {
        if (!this.config.includeSports && market.category === 'sports') return false
        if (filter.category !== undefined && market.category !== filter.category) {
          return false
        }
        return isListable(market, filter)
      })
      collected.push(...markets)
      next = this.nextCursor(cursor, parsed.value)

      if (collected.length > 0 || next === null) break
      const advanced = parseCursor(next, query !== '')
      if (advanced === null) break
      cursor = advanced
    }

    let markets = collected
    if (filter.limit !== undefined && filter.limit >= 0) {
      markets = markets.slice(0, filter.limit)
    }

    return { ok: true, data: { markets, nextCursor: next } }
  }

  async listSubcategories(
    _category: MarketCategory,
  ): Promise<Result<Subcategory[]>> {
    return this.fail(
      'unsupported',
      'Limitless no publica un listado de subcategorías.',
    )
  }

  async redeemPosition(
    _position: Position,
    _opts: { from: string },
  ): Promise<Result<RedeemReceipt>> {
    return this.fail(
      'unsupported',
      'El cobro de posiciones de Limitless aún no está soportado en esta app.',
    )
  }

  private mapListing(page: RawListingPage): Market[] {
    const markets: Market[] = []
    for (const item of page.items) {
      if (item.kind === 'group') {
        markets.push(...mapGroupToDomain(item.group, this.venue, this.chainId))
      } else {
        const market = mapMarketToDomain(item.market, this.venue, this.chainId)
        if (market !== null) markets.push(market)
      }
    }
    return markets
  }

  private nextCursor(cursor: Cursor, page: RawListingPage): string | null {
    const morePages =
      page.totalMarketsCount !== null
        ? cursor.page * PAGE_LIMIT < page.totalMarketsCount
        : page.items.length === PAGE_LIMIT

    if (cursor.kind === 'search') {
      return morePages ? `search:${cursor.page + 1}` : null
    }
    if (morePages) return `${cursor.kind}:${cursor.page + 1}`
    // Agotados los mercados simples, se continúa con los grupos negRisk.
    return cursor.kind === 'clob' ? 'group:1' : null
  }

  // --- Mercado individual -------------------------------------------------------------

  async getMarket(id: string): Promise<Result<Market | null>> {
    const slug = this.slugOf(id)
    if (slug === null) {
      return { ok: true, data: null }
    }

    let raw: unknown
    try {
      raw = await this.gateway.getMarket(slug)
    } catch (cause) {
      if (cause instanceof LimitlessHttpError && cause.status === 404) {
        return { ok: true, data: null }
      }
      return this.networkFail('el mercado', cause)
    }

    const parsed = parseMarket(raw)
    if (parsed === null) {
      return this.invalidResponseFail('cargar el mercado')
    }
    // Nota: fuera del listado el submercado de un grupo se resuelve sin el
    // contexto del grupo (la API del detalle no lo repite).
    return {
      ok: true,
      data: mapMarketToDomain(parsed, this.venue, this.chainId),
    }
  }

  private slugOf(marketId: string): string | null {
    const parsed = parseMarketId(marketId)
    if (parsed === null || parsed.venue !== this.venue) return null
    return parsed.nativeId
  }

  // --- Cotización -----------------------------------------------------------------------

  async getQuote(
    marketId: string,
    outcomeId: string,
    stake: DecimalString,
  ): Promise<Result<Quote>> {
    const slug = this.slugOf(marketId)
    if (slug === null) {
      return this.fail('not_found', 'El identificador del mercado no es de Limitless.')
    }
    if (outcomeId !== 'yes' && outcomeId !== 'no') {
      return this.fail('not_found', 'Ese resultado no existe en este mercado.')
    }

    let rawMarket: unknown
    let rawBook: unknown
    try {
      rawMarket = await this.gateway.getMarket(slug)
      rawBook = await this.gateway.getOrderbook(slug)
    } catch (cause) {
      if (cause instanceof LimitlessHttpError && cause.status === 404) {
        return this.fail('not_found', 'Este mercado ya no existe en Limitless.')
      }
      return this.networkFail('la cotización', cause)
    }

    const market = parseMarket(rawMarket)
    const book = parseOrderbook(rawBook)
    if (market === null || book === null) {
      return this.invalidResponseFail('cotizar')
    }
    if (market.tradeType !== 'clob') {
      return this.fail('unsupported', 'Este mercado no usa order book y no se puede cotizar aquí.')
    }
    if (mapStatus(market.status, market.expired, market.hidden) !== 'open') {
      return this.fail('not_quotable', 'Este mercado no acepta apuestas ahora mismo.')
    }
    if (market.tokens === null || market.collateralToken === null || market.venue.exchange === null) {
      return this.invalidResponseFail('cotizar')
    }

    const { decimals } = market.collateralToken
    let stakeRaw: bigint
    try {
      stakeRaw = parseUnits(stake, decimals)
    } catch (cause) {
      return this.fail('unknown', 'El importe de la apuesta no es válido.', cause)
    }
    if (stakeRaw <= 0n) {
      return this.fail('not_quotable', 'El importe de la apuesta debe ser mayor que cero.')
    }

    // Cotización ejecutable de verdad: se recorre el libro, no el punto medio.
    const walk = walkBuy(buyLevels(book, outcomeId), stakeRaw)
    if (walk === null) {
      return this.fail(
        'not_quotable',
        'No hay liquidez suficiente en el libro para ese importe ahora mismo.',
      )
    }

    let expectedPayout: DecimalString
    try {
      expectedPayout = toDecimal(formatUnits(walk.sharesRaw, decimals))
    } catch (cause) {
      return this.fail('unknown', 'No se pudo calcular el pago esperado.', cause)
    }

    const venueData: LimitlessQuoteData = {
      slug,
      outcome: outcomeId,
      tokenId: market.tokens[outcomeId],
      worstPriceMilli: walk.worstPriceMilli,
      feeMarket: market.feeMarket,
      exchange: market.venue.exchange,
      collateralAddress: market.collateralToken.address,
      collateralDecimals: decimals,
    }
    return {
      ok: true,
      data: {
        marketId,
        outcomeId,
        stake,
        // Acciones compradas × $1 si acierta. En mercados con comisión de
        // taker, el venue descuenta su fee de esta cantidad al ejecutar.
        expectedPayout,
        priceImpact: priceImpactOf(walk),
        expiresAt: null,
        venueData,
      },
    }
  }

  // --- Colocación ---------------------------------------------------------------------------

  async placeBet(quote: Quote, opts: BetOptions): Promise<Result<BetReceipt>> {
    if (this.config.auth === null) {
      return this.fail(
        'unsupported',
        'Este despliegue no tiene credenciales de API de Limitless (VITE_LIMITLESS_API_TOKEN_ID/SECRET), así que no puede colocar órdenes.',
      )
    }
    if (this.wallet === null) {
      return this.fail('wallet', 'Conecta una wallet para apostar.')
    }
    if (!isAddress(opts.from)) {
      return this.fail('wallet', 'La dirección de la wallet no es válida.')
    }
    if (!isLimitlessQuoteData(quote.venueData)) {
      return this.fail(
        'invalid_response',
        'La cotización no contiene los datos de Limitless. Vuelve a cotizar antes de apostar.',
      )
    }
    if (
      !Number.isFinite(opts.slippageTolerance) ||
      opts.slippageTolerance < 0 ||
      opts.slippageTolerance >= 1
    ) {
      return this.fail('unknown', 'La tolerancia de slippage debe estar entre 0 y 1.')
    }
    const data = quote.venueData
    if (!isAddress(data.exchange) || !isAddress(data.collateralAddress)) {
      return this.fail('invalid_response', 'La cotización lleva direcciones inválidas. Vuelve a cotizar.')
    }

    // 1. Perfil: ownerId de la orden, tarifa del usuario y verificación de que
    //    el token API pertenece a la wallet que firma.
    let rawProfile: unknown
    try {
      rawProfile = await this.gateway.getMyProfile()
    } catch (cause) {
      return this.authAwareFail('el perfil de Limitless', cause)
    }
    const profile = parseProfile(rawProfile)
    if (profile === null) {
      return this.invalidResponseFail('cargar el perfil')
    }
    if (profile.account.toLowerCase() !== opts.from.toLowerCase()) {
      return this.fail(
        'wallet',
        `El token API de Limitless pertenece a otra cuenta (${profile.account}). Conecta esa wallet o deriva un token con la actual.`,
      )
    }

    // 2. Importes: FAK de compra con precio límite = peor precio cotizado más
    //    el slippage tolerado. La API exige precio × acciones exacto.
    let stakeRaw: bigint
    try {
      stakeRaw = parseUnits(quote.stake, data.collateralDecimals)
    } catch (cause) {
      return this.fail('unknown', 'El importe de la apuesta no es válido.', cause)
    }
    const priceMilli = limitPriceMilli(data.worstPriceMilli, opts.slippageTolerance)
    const amounts = sizeFakBuy(stakeRaw, priceMilli)
    if (amounts === null) {
      return this.fail(
        'not_quotable',
        'El importe es demasiado pequeño para el mínimo de orden de Limitless.',
      )
    }
    if (
      amounts.makerAmountRaw > BigInt(Number.MAX_SAFE_INTEGER) ||
      amounts.takerAmountRaw > BigInt(Number.MAX_SAFE_INTEGER)
    ) {
      return this.fail('unknown', 'El importe de la apuesta es demasiado grande.')
    }

    // 3. Allowance del colateral hacia el exchange del venue.
    try {
      const current = await this.wallet.readAllowance(
        data.collateralAddress,
        opts.from,
        data.exchange,
      )
      if (current < amounts.makerAmountRaw) {
        await this.wallet.approve(data.collateralAddress, data.exchange, amounts.makerAmountRaw)
      }
    } catch (cause) {
      return this.walletFail('No se pudo aprobar el gasto del colateral.', cause)
    }

    // 4. Orden firmada EIP-712 contra el exchange del venue.
    const nowMs = this.now()
    const account = getAddress(opts.from) // la API exige direcciones con checksum
    const unsigned = {
      salt: String(nowMs),
      maker: account,
      signer: account,
      taker: ZERO_ADDRESS,
      tokenId: data.tokenId,
      makerAmount: Number(amounts.makerAmountRaw),
      takerAmount: Number(amounts.takerAmountRaw),
      expiration: '0',
      nonce: 0 as const,
      feeRateBps: data.feeMarket ? profile.feeRateBps : 0,
      side: 0 as const,
    }
    let signature: Hex
    try {
      signature = await this.wallet.signOrderTypedData(
        buildOrderTypedData({
          account,
          chainId: this.config.chainId,
          verifyingContract: data.exchange,
          order: unsigned,
        }),
      )
    } catch (cause) {
      return this.walletFail('No se pudo firmar la orden.', cause)
    }

    const order: LimitlessSignedOrder = {
      ...unsigned,
      price: priceMilli / 1000,
      signature,
      signatureType: 0,
    }

    // 5. Envío y clasificación del resultado.
    let rawResponse: unknown
    try {
      rawResponse = await this.gateway.submitOrder({
        order,
        ownerId: profile.id,
        orderType: 'FAK',
        marketSlug: data.slug,
      })
    } catch (cause) {
      if (cause instanceof LimitlessHttpError) {
        const message = limitlessErrorMessage(cause)
        if (cause.status === 400 || cause.status === 409 || cause.status === 425) {
          return this.fail(
            'not_quotable',
            message ?? 'Limitless rechazó la orden. Vuelve a cotizar e inténtalo de nuevo.',
            cause,
          )
        }
        if (cause.status === 401 || cause.status === 403) {
          return this.fail(
            'wallet',
            message ?? 'Limitless rechazó las credenciales del token API.',
            cause,
          )
        }
      }
      return this.networkFail('el envío de la orden', cause)
    }
    const response = parseCreateOrderResponse(rawResponse)
    if (response === null) {
      return this.invalidResponseFail('enviar la orden')
    }

    // FAK: si no casó nada, la orden se canceló sin comprar.
    if (
      response.settlementStatus === 'FAILED' ||
      response.settlementStatus === 'CANCELED' ||
      (response.settlementStatus === 'UNMATCHED' && !response.matched)
    ) {
      return this.fail(
        'not_quotable',
        response.reason ??
          'La orden no se pudo ejecutar al precio protegido. Vuelve a cotizar.',
      )
    }

    const confirmed =
      response.settlementStatus === 'MINED' || response.settlementStatus === 'CONFIRMED'
    return {
      ok: true,
      data: {
        marketId: quote.marketId,
        outcomeId: quote.outcomeId,
        stake: quote.stake,
        reference: response.orderId ?? response.txHash ?? `limitless-${nowMs}`,
        explorerUrl:
          response.txHash !== null ? `https://basescan.org/tx/${response.txHash}` : null,
        placedAt: new Date(nowMs),
        status: confirmed ? 'confirmed' : 'pending',
      },
    }
  }

  /** Clasifica fallos de peticiones autenticadas (perfil, posiciones). */
  private authAwareFail<T>(operation: string, cause: unknown): Result<T> {
    if (cause instanceof LimitlessHttpError && (cause.status === 401 || cause.status === 403)) {
      return this.fail(
        'wallet',
        'Limitless rechazó las credenciales del token API. Revisa VITE_LIMITLESS_API_TOKEN_ID/SECRET.',
        cause,
      )
    }
    return this.networkFail(operation, cause)
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

  // --- Posiciones ------------------------------------------------------------------------------

  async getPositions(address: string): Promise<Result<Position[]>> {
    if (this.config.auth === null) {
      return this.fail(
        'unsupported',
        'Leer posiciones de Limitless requiere credenciales de API (VITE_LIMITLESS_API_TOKEN_ID/SECRET).',
      )
    }
    if (!isAddress(address)) {
      return this.fail('wallet', 'La dirección de la wallet no es válida.')
    }

    let rawProfile: unknown
    let rawPositions: unknown
    try {
      rawProfile = await this.gateway.getMyProfile()
      rawPositions = await this.gateway.getPositions()
    } catch (cause) {
      return this.authAwareFail('tus posiciones', cause)
    }

    const profile = parseProfile(rawProfile)
    if (profile === null) {
      return this.invalidResponseFail('cargar el perfil')
    }
    if (profile.account.toLowerCase() !== address.toLowerCase()) {
      return this.fail(
        'wallet',
        `El token API de Limitless pertenece a otra cuenta (${profile.account}); estas posiciones no son de la wallet conectada.`,
      )
    }

    const positions = parseClobPositions(rawPositions)
    if (positions === null) {
      return this.invalidResponseFail('cargar tus posiciones')
    }
    return {
      ok: true,
      data: positions.value.flatMap((p) => mapClobPositionToDomain(p, this.venue)),
    }
  }
}
