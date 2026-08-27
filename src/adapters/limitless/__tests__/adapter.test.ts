/**
 * Tests del adaptador completo contra una pasarela falsa alimentada con los
 * fixtures reales. Ni un byte de red.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Address, Hex } from 'viem'
import { toDecimal, type Quote } from '../../../domain/types.ts'
import { LimitlessAdapter } from '../LimitlessAdapter.ts'
import { makeLimitlessConfig, type LimitlessConfig } from '../config.ts'
import {
  LimitlessHttpError,
  type CreateOrderPayload,
  type LimitlessGateway,
  type LimitlessOrderTypedData,
  type LimitlessWalletBridge,
} from '../gateway.ts'
import groupsFixture from './fixtures/markets-active-group.json'
import activeFixture from './fixtures/markets-active.json'
import searchFixture from './fixtures/markets-search.json'
import detailFixture from './fixtures/market-detail.json'
import orderbookFixture from './fixtures/orderbook.json'
import positionsFixture from './fixtures/positions.synthetic.json'
import profileFixture from './fixtures/profile.synthetic.json'

const AUTH = { tokenId: 'tok-1', secret: 'c2VjcmV0bw==' }
// Coincide con `account` del perfil sintético.
const BETTOR = '0x2222222222222222222222222222222222222222'
const DETAIL_MARKET_ID = 'limitless:btc-up-or-down-5-min-1787843400'
const DETAIL_EXCHANGE = '0x05c748E2f4DcDe0ec9Fa8DDc40DE6b867f923fa5'

// Los fixtures se capturaron el 2026-08-27 con mercados aún abiertos;
// congelamos el reloj en ese momento para que el test no caduque.
const FROZEN_NOW = new Date(1787842000000)

class FakeGateway implements LimitlessGateway {
  calls: string[] = []
  responses: Partial<Record<keyof LimitlessGateway, unknown>> = {}
  errors: Partial<Record<keyof LimitlessGateway, Error>> = {}
  lastSubmit: CreateOrderPayload | null = null
  lastListParams: unknown = null

  private answer(method: keyof LimitlessGateway, fallback: unknown): Promise<unknown> {
    this.calls.push(method)
    const error = this.errors[method]
    if (error !== undefined) return Promise.reject(error)
    return Promise.resolve(
      method in this.responses ? this.responses[method] : fallback,
    )
  }

  listActiveMarkets(params: unknown) {
    this.lastListParams = params
    const tradeType = (params as { tradeType: string }).tradeType
    return this.answer(
      'listActiveMarkets',
      tradeType === 'group' ? groupsFixture : activeFixture,
    )
  }
  searchMarkets() {
    return this.answer('searchMarkets', searchFixture)
  }
  getMarket() {
    return this.answer('getMarket', detailFixture)
  }
  getOrderbook() {
    return this.answer('getOrderbook', orderbookFixture)
  }
  getMyProfile() {
    return this.answer('getMyProfile', profileFixture)
  }
  getPositions() {
    return this.answer('getPositions', positionsFixture)
  }
  submitOrder(payload: CreateOrderPayload) {
    this.lastSubmit = payload
    return this.answer('submitOrder', {
      orderId: 'ord-1',
      execution: { matched: true, settlementStatus: 'MATCHED', txHash: null },
    })
  }
}

class FakeWallet implements LimitlessWalletBridge {
  allowance = 0n
  approvals: { spender: Address; amount: bigint }[] = []
  signedTypedData: LimitlessOrderTypedData | null = null
  signError: unknown = null

  async readAllowance() {
    return this.allowance
  }
  async approve(_token: Address, spender: Address, amount: bigint) {
    this.approvals.push({ spender, amount })
    this.allowance = amount
  }
  async signOrderTypedData(typedData: LimitlessOrderTypedData): Promise<Hex> {
    if (this.signError !== null) throw this.signError
    this.signedTypedData = typedData
    return '0xfirma'
  }
}

function makeAdapter(overrides?: {
  config?: LimitlessConfig
  gateway?: FakeGateway
  wallet?: FakeWallet
}) {
  const gateway = overrides?.gateway ?? new FakeGateway()
  const adapter = new LimitlessAdapter({
    config: overrides?.config ?? makeLimitlessConfig({ auth: AUTH }),
    gateway,
    wallet: overrides?.wallet,
    now: () => FROZEN_NOW.getTime(),
  })
  return { adapter, gateway }
}

async function quoteNo(adapter: LimitlessAdapter, stake = '0.5'): Promise<Quote> {
  const result = await adapter.getQuote(DETAIL_MARKET_ID, 'no', toDecimal(stake))
  if (!result.ok) throw new Error(`cotización falló: ${result.error.message}`)
  return result.data
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(FROZEN_NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('capacidades', () => {
  it('sin credenciales de API no hay órdenes ni posiciones', () => {
    const sinAuth = makeAdapter({ config: makeLimitlessConfig() })
    expect(sinAuth.adapter.venue).toBe('limitless')
    expect(sinAuth.adapter.chainId).toBe(8453)
    expect(sinAuth.adapter.capabilities).toEqual({
      canQuote: true,
      canPlaceBet: false,
      canReadPositions: false,
      canSubscribe: false,
      canSearch: true,
    })

    const conAuth = makeAdapter()
    expect(conAuth.adapter.capabilities.canPlaceBet).toBe(true)
    expect(conAuth.adapter.capabilities.canReadPositions).toBe(true)
  })
})

describe('listMarkets', () => {
  it('lista los mercados CLOB reales y pagina con cursor compuesto', async () => {
    const { adapter, gateway } = makeAdapter()
    const result = await adapter.listMarkets({})

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(gateway.lastListParams).toEqual({ tradeType: 'clob', page: 1, limit: 25 })

    const { markets, nextCursor } = result.data
    expect(markets.length).toBe(10)
    expect(nextCursor).toBe('clob:2') // totalMarketsCount 665 > 25
    for (const market of markets) {
      expect(market.venue).toBe('limitless')
      expect(market.status).toBe('open')
      expect(market.isQuotable).toBe(true)
      expect(market.category).toBe('crypto')
      expect(market.priceFormat).toBe('probability')
    }
  })

  it('tras los mercados simples continúa con los grupos negRisk', async () => {
    const { adapter, gateway } = makeAdapter()
    const result = await adapter.listMarkets({ cursor: 'group:1' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(gateway.lastListParams).toEqual({ tradeType: 'group', page: 1, limit: 25 })
    // Los dos grupos del fixture son de fútbol: el plan asigna deportes a
    // Azuro, así que por defecto aquí no sale nada...
    expect(result.data.markets.length).toBe(0)
    expect(result.data.nextCursor).toBe('group:2')
  })

  it('...salvo que se configure includeSports', async () => {
    const { adapter } = makeAdapter({
      config: makeLimitlessConfig({ auth: AUTH, includeSports: true }),
    })
    const result = await adapter.listMarkets({ cursor: 'group:1' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // 2 grupos × 3 submercados.
    expect(result.data.markets.length).toBe(6)
    for (const market of result.data.markets) {
      expect(market.category).toBe('sports')
      expect(market.group).toBeDefined()
      expect(market.question).toContain(market.group?.label ?? '')
    }
  })

  it('filtra por categoría en cliente y por venue sin tocar la red', async () => {
    const { adapter, gateway } = makeAdapter()
    const porCategoria = await adapter.listMarkets({ category: 'politics' })
    expect(porCategoria.ok && porCategoria.data.markets.length).toBe(0)
    expect(gateway.calls.length).toBe(1) // la página se pidió, el filtro es local

    gateway.calls = []
    const porVenue = await adapter.listMarkets({ venues: ['azuro'] })
    expect(porVenue.ok && porVenue.data.markets.length).toBe(0)
    const deportes = await adapter.listMarkets({ category: 'sports' })
    expect(deportes.ok && deportes.data.markets.length).toBe(0)
    expect(gateway.calls.length).toBe(0)
  })

  it('busca por texto con su propio cursor', async () => {
    const { adapter, gateway } = makeAdapter()
    const result = await adapter.listMarkets({ query: 'bitcoin' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(gateway.calls).toContain('searchMarkets')
    expect(result.data.markets.length).toBeGreaterThan(0)

    const malCursor = await adapter.listMarkets({ query: 'bitcoin', cursor: 'clob:2' })
    expect(malCursor.ok).toBe(false)
  })

  it('RESPUESTA MALFORMADA → invalid_response; fallo de red → network', async () => {
    const { adapter, gateway } = makeAdapter()
    gateway.responses.listActiveMarkets = { esto: 'no es un listado' }
    const malformada = await adapter.listMarkets({})
    expect(!malformada.ok && malformada.error.kind).toBe('invalid_response')

    gateway.errors.listActiveMarkets = new Error('ECONNRESET')
    const caida = await adapter.listMarkets({})
    expect(!caida.ok && caida.error.kind).toBe('network')
    if (!caida.ok) expect(caida.error.venue).toBe('limitless')
  })
})

describe('getMarket', () => {
  it('resuelve por slug y devuelve null para 404 o ids ajenos', async () => {
    const { adapter, gateway } = makeAdapter()
    const result = await adapter.getMarket(DETAIL_MARKET_ID)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data?.id).toBe(DETAIL_MARKET_ID)

    const ajeno = await adapter.getMarket('azuro:123/456')
    expect(ajeno.ok && ajeno.data).toBeNull()

    gateway.errors.getMarket = new LimitlessHttpError(404, '{}', '/markets/x')
    const desaparecido = await adapter.getMarket('limitless:ya-no-existe')
    expect(desaparecido.ok && desaparecido.data).toBeNull()
  })
})

describe('getQuote', () => {
  it('SIN COTIZACIÓN EJECUTABLE real: el lado Up no tiene asks alcanzables', async () => {
    const { adapter } = makeAdapter()
    const result = await adapter.getQuote(DETAIL_MARKET_ID, 'yes', toDecimal('0.5'))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('not_quotable')
  })

  it('cotiza el lado Down recorriendo el libro real', async () => {
    const { adapter } = makeAdapter()
    const quote = await quoteNo(adapter, '0.5')
    expect(quote.expectedPayout).toBe('13.513513')
    expect(quote.priceImpact).toBe(0)
    expect(quote.venueData).toEqual({
      slug: 'btc-up-or-down-5-min-1787843400',
      outcome: 'no',
      tokenId: (detailFixture as { tokens: { no: string } }).tokens.no,
      worstPriceMilli: 37,
      feeMarket: true,
      exchange: DETAIL_EXCHANGE,
      collateralAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      collateralDecimals: 6,
    })
  })

  it('liquidez insuficiente, mercado pausado o basura → error tipado', async () => {
    const { adapter, gateway } = makeAdapter()
    const enorme = await adapter.getQuote(DETAIL_MARKET_ID, 'no', toDecimal('100000'))
    expect(!enorme.ok && enorme.error.kind).toBe('not_quotable')

    gateway.responses.getMarket = {
      ...(detailFixture as Record<string, unknown>),
      status: 'LOCKED',
    }
    const pausado = await adapter.getQuote(DETAIL_MARKET_ID, 'no', toDecimal('0.5'))
    expect(!pausado.ok && pausado.error.kind).toBe('not_quotable')

    gateway.responses.getMarket = 'basura'
    const malformada = await adapter.getQuote(DETAIL_MARKET_ID, 'no', toDecimal('0.5'))
    expect(!malformada.ok && malformada.error.kind).toBe('invalid_response')
  })
})

describe('placeBet', () => {
  it('sin credenciales → unsupported; sin wallet → wallet', async () => {
    const conWallet = makeAdapter({
      config: makeLimitlessConfig(),
      wallet: new FakeWallet(),
    })
    const quote = await quoteNo(conWallet.adapter)
    const sinAuth = await conWallet.adapter.placeBet(quote, {
      slippageTolerance: 0.05,
      from: BETTOR,
    })
    expect(!sinAuth.ok && sinAuth.error.kind).toBe('unsupported')

    const { adapter } = makeAdapter()
    const sinWallet = await adapter.placeBet(quote, {
      slippageTolerance: 0.05,
      from: BETTOR,
    })
    expect(!sinWallet.ok && sinWallet.error.kind).toBe('wallet')
  })

  it('flujo completo: perfil, allowance, firma EIP-712 y orden FAK exacta', async () => {
    const wallet = new FakeWallet()
    const { adapter, gateway } = makeAdapter({ wallet })
    const quote = await quoteNo(adapter, '0.5')

    const result = await adapter.placeBet(quote, {
      slippageTolerance: 0.05,
      from: BETTOR,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.status).toBe('pending')
    expect(result.data.reference).toBe('ord-1')
    expect(result.data.placedAt).toEqual(FROZEN_NOW)

    // Aprobó exactamente el gasto máximo de la FAK al exchange del venue.
    expect(wallet.approvals).toEqual([
      { spender: DETAIL_EXCHANGE, amount: 499_980n },
    ])

    const submitted = gateway.lastSubmit
    expect(submitted).not.toBeNull()
    if (submitted === null) return
    expect(submitted.orderType).toBe('FAK')
    expect(submitted.marketSlug).toBe('btc-up-or-down-5-min-1787843400')
    expect(submitted.ownerId).toBe(777) // id del perfil sintético
    // Peor precio 0.037 + 5% de slippage → límite 0.039, exacto en crudo.
    expect(submitted.order.price).toBe(0.039)
    expect(submitted.order.makerAmount).toBe(499_980)
    expect(submitted.order.takerAmount).toBe(12_820_000)
    expect(submitted.order.feeRateBps).toBe(300) // mercado con fee → banda del perfil
    expect(submitted.order.side).toBe(0)
    expect(submitted.order.nonce).toBe(0)
    expect(submitted.order.expiration).toBe('0')
    expect(submitted.order.salt).toBe(String(FROZEN_NOW.getTime()))
    expect(submitted.order.signature).toBe('0xfirma')

    // La firma usó el dominio EIP-712 del exchange del venue.
    expect(wallet.signedTypedData?.domain.verifyingContract).toBe(DETAIL_EXCHANGE)
    expect(wallet.signedTypedData?.domain.name).toBe('Limitless CTF Exchange')
  })

  it('estados de ejecución: MINED → confirmado con explorer; FAK sin cruce → not_quotable', async () => {
    const wallet = new FakeWallet()
    const { adapter, gateway } = makeAdapter({ wallet })
    const quote = await quoteNo(adapter)

    gateway.responses.submitOrder = {
      orderId: 'ord-2',
      execution: { matched: true, settlementStatus: 'MINED', txHash: '0xabc123' },
    }
    const minada = await adapter.placeBet(quote, { slippageTolerance: 0.05, from: BETTOR })
    expect(minada.ok).toBe(true)
    if (minada.ok) {
      expect(minada.data.status).toBe('confirmed')
      expect(minada.data.explorerUrl).toBe('https://basescan.org/tx/0xabc123')
    }

    gateway.responses.submitOrder = {
      orderId: 'ord-3',
      execution: { matched: false, settlementStatus: 'UNMATCHED', txHash: null },
    }
    const sinCruce = await adapter.placeBet(quote, { slippageTolerance: 0.05, from: BETTOR })
    expect(!sinCruce.ok && sinCruce.error.kind).toBe('not_quotable')
  })

  it('errores del venue y de la wallet se clasifican', async () => {
    const wallet = new FakeWallet()
    const { adapter, gateway } = makeAdapter({ wallet })
    const quote = await quoteNo(adapter)

    gateway.errors.submitOrder = new LimitlessHttpError(
      400,
      '{"message":"insufficient balance"}',
      '/orders',
    )
    const rechazada = await adapter.placeBet(quote, { slippageTolerance: 0.05, from: BETTOR })
    expect(!rechazada.ok && rechazada.error.kind).toBe('not_quotable')
    if (!rechazada.ok) expect(rechazada.error.message).toBe('insufficient balance')

    delete gateway.errors.submitOrder
    wallet.signError = { name: 'UserRejectedRequestError' }
    const cancelada = await adapter.placeBet(quote, { slippageTolerance: 0.05, from: BETTOR })
    expect(!cancelada.ok && cancelada.error.kind).toBe('rejected')

    wallet.signError = null
    const otraCuenta = await adapter.placeBet(quote, {
      slippageTolerance: 0.05,
      from: '0x9999999999999999999999999999999999999999',
    })
    expect(!otraCuenta.ok && otraCuenta.error.kind).toBe('wallet')

    const ajena: Quote = { ...quote, venueData: { conditionId: 'de-azuro' } }
    const venueAjeno = await adapter.placeBet(ajena, { slippageTolerance: 0.05, from: BETTOR })
    expect(!venueAjeno.ok && venueAjeno.error.kind).toBe('invalid_response')
  })
})

describe('getPositions', () => {
  it('exige credenciales y que el token pertenezca a la wallet', async () => {
    const sinAuth = makeAdapter({ config: makeLimitlessConfig() })
    const noConfigurado = await sinAuth.adapter.getPositions(BETTOR)
    expect(!noConfigurado.ok && noConfigurado.error.kind).toBe('unsupported')

    const { adapter } = makeAdapter()
    const otraWallet = await adapter.getPositions(
      '0x9999999999999999999999999999999999999999',
    )
    expect(!otraWallet.ok && otraWallet.error.kind).toBe('wallet')
  })

  it('mapea las posiciones del fixture', async () => {
    const { adapter } = makeAdapter()
    const result = await adapter.getPositions(BETTOR)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.length).toBe(4)
    expect(result.data.map((p) => p.status)).toEqual([
      'open',
      'redeemable',
      'lost',
      'redeemable',
    ])
  })

  it('credenciales rechazadas → wallet; basura → invalid_response', async () => {
    const { adapter, gateway } = makeAdapter()
    gateway.errors.getMyProfile = new LimitlessHttpError(401, '{}', '/profiles/me')
    const rechazado = await adapter.getPositions(BETTOR)
    expect(!rechazado.ok && rechazado.error.kind).toBe('wallet')

    delete gateway.errors.getMyProfile
    gateway.responses.getPositions = { clob: 'mal' }
    const malformada = await adapter.getPositions(BETTOR)
    expect(!malformada.ok && malformada.error.kind).toBe('invalid_response')
  })
})
