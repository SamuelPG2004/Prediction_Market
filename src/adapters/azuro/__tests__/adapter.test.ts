/**
 * Tests del adaptador completo contra una pasarela falsa alimentada con los
 * fixtures reales. Ni un byte de red.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Address, Hex } from 'viem'
import { toDecimal, type Quote } from '../../../domain/types.ts'
import { AzuroAdapter } from '../AzuroAdapter.ts'
import { makeAzuroConfig, type AzuroConfig } from '../config.ts'
import type { AzuroGateway, AzuroWalletBridge, BetTypedData } from '../gateway.ts'
import { makeNativeId } from '../mappers.ts'
import betCalculationFixture from './fixtures/bet-calculation.json'
import betFeeFixture from './fixtures/bet-fee.json'
import betOrdersFixture from './fixtures/bets-by-bettor.synthetic.json'
import conditionsFixture from './fixtures/conditions-by-game.json'
import conditionsStateFixture from './fixtures/conditions-state.json'
import gamesFixture from './fixtures/games-prematch.json'
import navigationFixture from './fixtures/navigation.json'

const AFFILIATE = '0x1111111111111111111111111111111111111111' as Address
const BETTOR = '0x2222222222222222222222222222222222222222'

// Anclas de los fixtures (ver fixtures/README.md).
const PREMATCH_GAME_ID = '1006000000000030696510'
const ACTIVE_CONDITION_ID = '300610060000000000306965100000000000009043317948'
const ACTIVE_MARKET_ID = `azuro:${makeNativeId(PREMATCH_GAME_ID, ACTIVE_CONDITION_ID)}`
const STOPPED_CONDITION_ID = '300610060000000000306992750000000000009084689496'
const STOPPED_GAME_ID = '1006000000000030699275'

// Los fixtures se capturaron el 2026-08-27 con juegos aún por empezar;
// congelamos el reloj en ese momento para que el test no caduque.
const FROZEN_NOW = new Date(1787800000 * 1000)

/** Estado "fresco" de la condición activa, derivado del fixture real. */
const activeConditionState = (conditionsFixture as { conditionId: string }[])
  .filter((c) => c.conditionId === ACTIVE_CONDITION_ID)
  .map((c) => {
    const raw = c as unknown as Record<string, unknown>
    return { conditionId: raw.conditionId, state: raw.state, outcomes: raw.outcomes }
  })

class FakeGateway implements AzuroGateway {
  calls: string[] = []
  responses: Partial<Record<keyof AzuroGateway, unknown>> = {}
  errors: Partial<Record<keyof AzuroGateway, Error>> = {}
  lastSubmit: unknown = null

  private answer(method: keyof AzuroGateway, fallback: unknown): Promise<unknown> {
    this.calls.push(method)
    const error = this.errors[method]
    if (error !== undefined) return Promise.reject(error)
    return Promise.resolve(
      method in this.responses ? this.responses[method] : fallback,
    )
  }

  listGames() {
    return this.answer('listGames', gamesFixture)
  }
  searchGames() {
    return this.answer('searchGames', gamesFixture)
  }
  listSports() {
    return this.answer('listSports', navigationFixture)
  }
  getGamesByIds() {
    return this.answer('getGamesByIds', (gamesFixture as { games: unknown[] }).games)
  }
  getConditionsByGameIds() {
    return this.answer('getConditionsByGameIds', conditionsFixture)
  }
  getConditionsState() {
    return this.answer('getConditionsState', activeConditionState)
  }
  getBetCalculation() {
    return this.answer('getBetCalculation', betCalculationFixture)
  }
  getBetFee() {
    return this.answer('getBetFee', betFeeFixture)
  }
  getBetsByBettor() {
    return this.answer('getBetsByBettor', betOrdersFixture)
  }
  submitBet(params: unknown) {
    this.lastSubmit = params
    return this.answer('submitBet', { id: 'order-1', state: 'Created' })
  }
}

class FakeWallet implements AzuroWalletBridge {
  allowance = 0n
  approvals: { spender: Address; amount: bigint }[] = []
  signedTypedData: BetTypedData | null = null
  signError: unknown = null
  withdrawals: { lp: Address; core: Address; tokenId: bigint }[] = []
  withdrawError: unknown = null

  async readAllowance() {
    return this.allowance
  }
  async approve(_token: Address, spender: Address, amount: bigint) {
    this.approvals.push({ spender, amount })
    this.allowance = amount
  }
  async signBetTypedData(typedData: BetTypedData): Promise<Hex> {
    if (this.signError !== null) throw this.signError
    this.signedTypedData = typedData
    return '0xfirma'
  }
  async withdrawPayout(lp: Address, core: Address, tokenId: bigint): Promise<Hex> {
    if (this.withdrawError !== null) throw this.withdrawError
    this.withdrawals.push({ lp, core, tokenId })
    return '0xcobro'
  }
}

function makeAdapter(overrides?: {
  config?: AzuroConfig
  gateway?: FakeGateway
  wallet?: FakeWallet
}) {
  const gateway = overrides?.gateway ?? new FakeGateway()
  const adapter = new AzuroAdapter({
    config: overrides?.config ?? makeAzuroConfig(137, AFFILIATE),
    gateway,
    wallet: overrides?.wallet,
    now: () => FROZEN_NOW.getTime(),
  })
  return { adapter, gateway }
}

async function quoteForActiveMarket(
  adapter: AzuroAdapter,
  stake = '10',
): Promise<Quote> {
  const result = await adapter.getQuote(
    ACTIVE_MARKET_ID,
    '405',
    toDecimal(stake),
  )
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
  it('declara lo que sabe hacer; sin afiliado no puede apostar', () => {
    const { adapter } = makeAdapter()
    expect(adapter.venue).toBe('azuro')
    expect(adapter.chainId).toBe(137)
    expect(adapter.capabilities).toEqual({
      canQuote: true,
      canPlaceBet: true,
      canReadPositions: true,
      canSubscribe: false,
      canSearch: true,
      canListSubcategories: true,
      canRedeem: true,
    })

    const sinAfiliado = makeAdapter({ config: makeAzuroConfig(137, null) })
    expect(sinAfiliado.adapter.capabilities.canPlaceBet).toBe(false)
  })
})

describe('listSubcategories', () => {
  it('lista los deportes con partidos prematch, ordenados por actividad', async () => {
    const { adapter, gateway } = makeAdapter()
    const result = await adapter.listSubcategories('sports')
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(gateway.calls).toContain('listSports')
    // El fixture real trae 15 deportes; table-tennis está sin prematch y se cae.
    expect(result.data).toHaveLength(14)
    expect(result.data.map((s) => s.id)).not.toContain('table-tennis')
    expect(result.data[0]).toEqual({
      id: 'football',
      label: 'Football',
      activeCount: 661,
    })
    // Esports incluidos: comparten la categoría 'sports' del dominio.
    expect(result.data.map((s) => s.id)).toContain('cs2')
  })

  it('otra categoría devuelve lista vacía sin tocar la red', async () => {
    const { adapter, gateway } = makeAdapter()
    const result = await adapter.listSubcategories('crypto')
    expect(result).toEqual({ ok: true, data: [] })
    expect(gateway.calls).toHaveLength(0)
  })

  it('respuesta corrupta → invalid_response; red caída → network', async () => {
    const { adapter, gateway } = makeAdapter()
    gateway.responses.listSports = { esto: 'no es una navegación' }
    const corrupt = await adapter.listSubcategories('sports')
    expect(!corrupt.ok && corrupt.error.kind).toBe('invalid_response')

    gateway.errors.listSports = new Error('ECONNRESET')
    const offline = await adapter.listSubcategories('sports')
    expect(!offline.ok && offline.error.kind).toBe('network')
  })
})

describe('listMarkets', () => {
  it('lista mercados abiertos y cotizables a partir de los fixtures reales', async () => {
    const { adapter } = makeAdapter()
    const result = await adapter.listMarkets({})

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const { markets, nextCursor } = result.data

    expect(markets.length).toBeGreaterThan(0)
    // El fixture dice totalPages 100 → hay página siguiente.
    expect(nextCursor).toBe('2')
    for (const market of markets) {
      expect(market.venue).toBe('azuro')
      expect(market.status).toBe('open')
      expect(market.isQuotable).toBe(true)
      expect(market.id).toMatch(/^azuro:\d+\/\d+$/)
    }
    // MERCADO CERRADO/SUSPENDIDO: el juego parado del fixture no aparece.
    expect(
      markets.some((m) => m.group?.id === STOPPED_GAME_ID),
    ).toBe(false)
  })

  it('incluye los suspendidos solo si se piden explícitamente', async () => {
    const { adapter } = makeAdapter()
    const result = await adapter.listMarkets({
      includeClosed: true,
      includeNonQuotable: true,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(
      result.data.markets.some((m) => m.status === 'suspended'),
    ).toBe(true)
  })

  it('respeta limit y cursor', async () => {
    const { adapter, gateway } = makeAdapter()
    const result = await adapter.listMarkets({ limit: 3, cursor: '2' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.markets.length).toBeLessThanOrEqual(3)
    expect(gateway.calls).toContain('listGames')
  })

  it('otra categoría u otro venue → página vacía sin tocar la red', async () => {
    const { adapter, gateway } = makeAdapter()
    const porCategoria = await adapter.listMarkets({ category: 'crypto' })
    const porVenue = await adapter.listMarkets({ venues: ['limitless'] })
    expect(porCategoria.ok && porCategoria.data.markets.length).toBe(0)
    expect(porVenue.ok && porVenue.data.markets.length).toBe(0)
    expect(gateway.calls.length).toBe(0)
  })

  it('busca por texto en el servidor a partir de 3 caracteres', async () => {
    const { adapter, gateway } = makeAdapter()
    await adapter.listMarkets({ query: 'Manchester' })
    expect(gateway.calls).toContain('searchGames')

    gateway.calls = []
    const corto = await adapter.listMarkets({ query: 'ab' })
    expect(corto.ok && corto.data.markets.length).toBe(0)
    expect(gateway.calls.length).toBe(0)
  })

  it('RESPUESTA MALFORMADA: estructura inesperada → invalid_response', async () => {
    const { adapter, gateway } = makeAdapter()
    gateway.responses.listGames = { esto: 'no es una página de juegos' }
    const result = await adapter.listMarkets({})
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('invalid_response')
    expect(result.error.venue).toBe('azuro')
  })

  it('fallo de red → error network tipado, sin excepción', async () => {
    const { adapter, gateway } = makeAdapter()
    gateway.errors.listGames = new Error('ECONNRESET')
    const result = await adapter.listMarkets({})
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('network')
    expect(result.error.cause).toBeInstanceOf(Error)
  })
})

describe('getMarket', () => {
  it('resuelve un mercado por su id de dominio', async () => {
    const { adapter } = makeAdapter()
    const result = await adapter.getMarket(ACTIVE_MARKET_ID)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data?.id).toBe(ACTIVE_MARKET_ID)
    expect(result.data?.status).toBe('open')
  })

  it('id de otro venue o condición inexistente → null sin error', async () => {
    const { adapter } = makeAdapter()
    const otroVenue = await adapter.getMarket('limitless:algo')
    expect(otroVenue.ok && otroVenue.data).toBeNull()
    const inexistente = await adapter.getMarket(
      `azuro:${makeNativeId(PREMATCH_GAME_ID, '999')}`,
    )
    expect(inexistente.ok && inexistente.data).toBeNull()
  })
})

describe('getQuote', () => {
  it('cotiza con aritmética entera: 10 × 2.17 = 21.7 exacto', async () => {
    const { adapter } = makeAdapter()
    const quote = await quoteForActiveMarket(adapter, '10')
    expect(quote.expectedPayout).toBe('21.7')
    expect(quote.priceImpact).toBeNull()
    expect(quote.venueData).toEqual({
      conditionId: ACTIVE_CONDITION_ID,
      outcomeId: '405',
      odds: '2.17',
    })
  })

  it('MERCADO SIN COTIZACIÓN: condición parada → not_quotable', async () => {
    const { adapter, gateway } = makeAdapter()
    // Fixture real de condition-batch: las tres condiciones están Stopped.
    gateway.responses.getConditionsState = conditionsStateFixture
    const result = await adapter.getQuote(
      `azuro:${makeNativeId(STOPPED_GAME_ID, STOPPED_CONDITION_ID)}`,
      '377',
      toDecimal('10'),
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('not_quotable')
  })

  it('respeta los límites reales del protocolo (minBet 1, maxBet 825)', async () => {
    const { adapter } = makeAdapter()
    const grande = await adapter.getQuote(ACTIVE_MARKET_ID, '405', toDecimal('1000'))
    expect(!grande.ok && grande.error.kind).toBe('not_quotable')
    const pequeña = await adapter.getQuote(ACTIVE_MARKET_ID, '405', toDecimal('0.5'))
    expect(!pequeña.ok && pequeña.error.kind).toBe('not_quotable')
    const cero = await adapter.getQuote(ACTIVE_MARKET_ID, '405', toDecimal('0'))
    expect(!cero.ok && cero.error.kind).toBe('not_quotable')
  })

  it('outcome inexistente → not_found; respuesta malformada → invalid_response', async () => {
    const { adapter, gateway } = makeAdapter()
    const noExiste = await adapter.getQuote(ACTIVE_MARKET_ID, '999', toDecimal('10'))
    expect(!noExiste.ok && noExiste.error.kind).toBe('not_found')

    gateway.responses.getConditionsState = 'basura'
    const malformada = await adapter.getQuote(ACTIVE_MARKET_ID, '405', toDecimal('10'))
    expect(!malformada.ok && malformada.error.kind).toBe('invalid_response')
  })
})

describe('placeBet', () => {
  it('sin afiliado configurado → unsupported (y capabilities ya lo avisa)', async () => {
    const wallet = new FakeWallet()
    const { adapter } = makeAdapter({
      config: makeAzuroConfig(137, null),
      wallet,
    })
    const quote = await quoteForActiveMarket(adapter)
    const result = await adapter.placeBet(quote, {
      slippageTolerance: 0.05,
      from: BETTOR,
    })
    expect(!result.ok && result.error.kind).toBe('unsupported')
  })

  it('sin wallet → error wallet', async () => {
    const { adapter } = makeAdapter()
    const quote = await quoteForActiveMarket(adapter)
    const result = await adapter.placeBet(quote, {
      slippageTolerance: 0.05,
      from: BETTOR,
    })
    expect(!result.ok && result.error.kind).toBe('wallet')
  })

  it('flujo completo: allowance, firma EIP-712 y orden al relayer', async () => {
    const wallet = new FakeWallet()
    const { adapter, gateway } = makeAdapter({ wallet })
    const quote = await quoteForActiveMarket(adapter, '10')

    const result = await adapter.placeBet(quote, {
      slippageTolerance: 0.05,
      from: BETTOR,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.status).toBe('pending')
    expect(result.data.reference).toBe('order-1')
    expect(result.data.explorerUrl).toBeNull()
    expect(result.data.placedAt).toEqual(FROZEN_NOW)

    // Aprobó el gasto al relayer (allowance partía de 0).
    expect(wallet.approvals.length).toBe(1)
    expect(wallet.approvals[0].amount).toBe(10_000_000n) // 10 USDT + fee 0

    // La orden enviada lleva lo firmado.
    const submitted = gateway.lastSubmit as {
      clientData: Record<string, unknown>
      bet: Record<string, string>
      signature: string
    }
    expect(submitted.signature).toBe('0xfirma')
    expect(submitted.clientData.affiliate).toBe(AFFILIATE)
    expect(submitted.clientData.chainId).toBe(137)
    expect(submitted.bet.conditionId).toBe(ACTIVE_CONDITION_ID)
    expect(submitted.bet.outcomeId).toBe('405')
    expect(submitted.bet.amount).toBe('10000000')
    expect(submitted.bet.nonce).toBe(String(FROZEN_NOW.getTime()))
    // minOdds: cuota 2.17 con 5% de slippage, escalada a 12 decimales.
    // Debe quedar entre 1.0 y la cuota cotizada.
    const minOdds = BigInt(submitted.bet.minOdds)
    expect(minOdds).toBeGreaterThan(10n ** 12n)
    expect(minOdds).toBeLessThan(2_170_000_000_000n)

    // La firma usó el dominio EIP-712 del core de Azuro.
    expect(wallet.signedTypedData?.primaryType).toBe('ClientBetData')
  })

  it('rechazo del usuario en la wallet → kind rejected', async () => {
    const wallet = new FakeWallet()
    wallet.allowance = 10n ** 18n
    wallet.signError = { name: 'UserRejectedRequestError' }
    const { adapter } = makeAdapter({ wallet })
    const quote = await quoteForActiveMarket(adapter)
    const result = await adapter.placeBet(quote, {
      slippageTolerance: 0.05,
      from: BETTOR,
    })
    expect(!result.ok && result.error.kind).toBe('rejected')
  })

  it('orden rechazada por el relayer → not_quotable con mensaje legible', async () => {
    const wallet = new FakeWallet()
    const { adapter, gateway } = makeAdapter({ wallet })
    gateway.responses.submitBet = {
      id: 'order-2',
      state: 'Rejected',
      errorMessage: 'odds changed',
    }
    const quote = await quoteForActiveMarket(adapter)
    const result = await adapter.placeBet(quote, {
      slippageTolerance: 0.05,
      from: BETTOR,
    })
    expect(!result.ok && result.error.kind).toBe('not_quotable')
  })

  it('venueData ajeno (p. ej. de otro venue) no se ejecuta', async () => {
    const wallet = new FakeWallet()
    const { adapter } = makeAdapter({ wallet })
    const quote = await quoteForActiveMarket(adapter)
    const ajena: Quote = { ...quote, venueData: { orderId: 'de-otro-sitio' } }
    const result = await adapter.placeBet(ajena, {
      slippageTolerance: 0.05,
      from: BETTOR,
    })
    expect(!result.ok && result.error.kind).toBe('invalid_response')
  })
})

describe('getPositions', () => {
  it('mapea las órdenes con títulos de partido desnormalizados', async () => {
    const { adapter } = makeAdapter()
    const result = await adapter.getPositions(BETTOR)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    // 5 órdenes en el fixture: combo y rechazada fuera.
    expect(result.data.length).toBe(3)
    expect(result.data.map((p) => p.status)).toEqual([
      'open',
      'redeemable',
      'lost',
    ])
    expect(result.data[0].marketQuestion).toContain('Sebastian Heinrich')
  })

  it('sin apuestas (la API devuelve null) → lista vacía', async () => {
    const { adapter, gateway } = makeAdapter()
    gateway.responses.getBetsByBettor = null
    const result = await adapter.getPositions(BETTOR)
    expect(result.ok && result.data.length).toBe(0)
  })

  it('dirección inválida → error wallet; respuesta malformada → invalid_response', async () => {
    const { adapter, gateway } = makeAdapter()
    const invalida = await adapter.getPositions('esto-no-es-una-direccion')
    expect(!invalida.ok && invalida.error.kind).toBe('wallet')

    gateway.responses.getBetsByBettor = { orders: 'mal' }
    const malformada = await adapter.getPositions(BETTOR)
    expect(!malformada.ok && malformada.error.kind).toBe('invalid_response')
  })
})

describe('redeemPosition', () => {
  /** La posición 'Cobrable' del fixture sintético (orden ganada, betId 102). */
  async function redeemablePosition(adapter: AzuroAdapter) {
    const result = await adapter.getPositions(BETTOR)
    if (!result.ok) throw new Error('getPositions falló')
    const position = result.data.find((p) => p.status === 'redeemable')
    if (position === undefined) throw new Error('sin posición cobrable')
    return position
  }

  it('cobra vía LP.withdrawPayout con el LP fijado y el core de la orden', async () => {
    const wallet = new FakeWallet()
    const { adapter } = makeAdapter({ wallet })
    const position = await redeemablePosition(adapter)

    const result = await adapter.redeemPosition(position, { from: BETTOR })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(wallet.withdrawals).toEqual([
      {
        lp: makeAzuroConfig(137, AFFILIATE).lpAddress,
        core: '0x0223b3b0f01a1e69c9b1f8b6f8de71b6de5f1d8a',
        tokenId: 102n,
      },
    ])
    expect(result.data.positionId).toBe(position.id)
    expect(result.data.reference).toBe('0xcobro')
    expect(result.data.explorerUrl).toBe('https://polygonscan.com/tx/0xcobro')
  })

  it('exige wallet, posición cobrable y datos de cobro presentes', async () => {
    const sinWallet = makeAdapter().adapter
    const wallet = new FakeWallet()
    const { adapter } = makeAdapter({ wallet })
    const position = await redeemablePosition(adapter)

    const faltaWallet = await sinWallet.redeemPosition(position, { from: BETTOR })
    expect(!faltaWallet.ok && faltaWallet.error.kind).toBe('wallet')

    const noCobrable = await adapter.redeemPosition(
      { ...position, status: 'open' },
      { from: BETTOR },
    )
    expect(!noCobrable.ok && noCobrable.error.kind).toBe('not_quotable')

    const sinDatos = await adapter.redeemPosition(
      { ...position, venueData: undefined },
      { from: BETTOR },
    )
    expect(!sinDatos.ok && sinDatos.error.kind).toBe('invalid_response')
    expect(wallet.withdrawals).toHaveLength(0)
  })

  it('rechazo del usuario → rejected; otros fallos → wallet', async () => {
    const wallet = new FakeWallet()
    const { adapter } = makeAdapter({ wallet })
    const position = await redeemablePosition(adapter)

    wallet.withdrawError = { code: 4001 }
    const rechazado = await adapter.redeemPosition(position, { from: BETTOR })
    expect(!rechazado.ok && rechazado.error.kind).toBe('rejected')

    wallet.withdrawError = new Error('insufficient funds for gas')
    const sinGas = await adapter.redeemPosition(position, { from: BETTOR })
    expect(!sinGas.ok && sinGas.error.kind).toBe('wallet')
  })
})
