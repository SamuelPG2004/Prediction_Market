/**
 * Tests de validación, mapeo y matemática de libro con fixtures REALES de la
 * API de Limitless (ver fixtures/README.md). Sin red.
 */
import { describe, expect, it } from 'vitest'
import { isListable } from '../../../domain/types.ts'
import { buildHmacHeaders } from '../auth.ts'
import {
  buyLevels,
  limitPriceMilli,
  priceImpactOf,
  sizeFakBuy,
  toPriceMilli,
  walkBuy,
} from '../book.ts'
import { buildOrderTypedData } from '../gateway.ts'
import {
  mapCategory,
  mapClobPositionToDomain,
  mapGroupToDomain,
  mapMarketToDomain,
  mapStatus,
} from '../mappers.ts'
import {
  parseActivePage,
  parseClobPositions,
  parseMarket,
  parseOrderbook,
  parseSearchPage,
  type RawLimitlessMarket,
} from '../validate.ts'
import groupsFixture from './fixtures/markets-active-group.json'
import activeFixture from './fixtures/markets-active.json'
import searchFixture from './fixtures/markets-search.json'
import detailFixture from './fixtures/market-detail.json'
import resolvedFixture from './fixtures/market-resolved.json'
import orderbookFixture from './fixtures/orderbook.json'
import positionsFixture from './fixtures/positions.synthetic.json'

const VENUE = 'limitless'
const CHAIN_ID = 8453

function loadDetail(): RawLimitlessMarket {
  const market = parseMarket(detailFixture as unknown)
  if (market === null) throw new Error('el fixture de detalle no valida')
  return market
}

describe('validación de fixtures reales', () => {
  it('la página de mercados activos valida sin descartar nada', () => {
    const parsed = parseActivePage(activeFixture as unknown)
    expect(parsed).not.toBeNull()
    expect(parsed?.dropped).toBe(0)
    expect(parsed?.value.items.length).toBe(10)
    expect(parsed?.value.totalMarketsCount).toBe(665)
  })

  it('la búsqueda valida con su envoltorio propio (markets, no data)', () => {
    const parsed = parseSearchPage(searchFixture as unknown)
    expect(parsed).not.toBeNull()
    expect(parsed?.dropped).toBe(0)
    expect(parsed?.value.items.length).toBe(3)
  })

  it('RESPUESTA MALFORMADA: estructura inesperada devuelve null', () => {
    expect(parseActivePage({ foo: 'bar' })).toBeNull()
    expect(parseActivePage('cadena')).toBeNull()
    expect(parseSearchPage({ data: [] })).toBeNull()
    expect(parseOrderbook({ bids: 'no' })).toBeNull()
    expect(parseMarket({ title: 'sin slug' })).toBeNull()
  })

  it('un mercado sin campos obligatorios se descarta, el resto sobrevive', () => {
    const mutated = {
      ...(activeFixture as Record<string, unknown>),
      data: [
        ...(activeFixture as { data: unknown[] }).data,
        { title: 'sin slug ni nada' },
      ],
    }
    const parsed = parseActivePage(mutated)
    expect(parsed?.dropped).toBe(1)
    expect(parsed?.value.items.length).toBe(10)
  })
})

describe('mapMarketToDomain', () => {
  it('mapea un mercado FUNDED real a un mercado abierto y cotizable', () => {
    const market = mapMarketToDomain(loadDetail(), VENUE, CHAIN_ID)
    expect(market).not.toBeNull()
    if (market === null) return

    expect(market.id).toBe('limitless:btc-up-or-down-5-min-1787843400')
    expect(market.venue).toBe(VENUE)
    expect(market.chainId).toBe(CHAIN_ID)
    expect(market.status).toBe('open')
    expect(market.isQuotable).toBe(true)
    expect(market.category).toBe('crypto')
    expect(market.priceFormat).toBe('probability')
    expect(market.closesAt).toEqual(new Date(1787843700000))
    // Métricas que el CLOB no aporta por mercado: null, no un 0 inventado.
    expect(market.liquidityUsd).toBeNull()
    expect(market.volume24hUsd).toBeNull()

    // Mercado recurrente de precio: YES es "Up" y NO es "Down".
    const [up, down] = market.outcomes
    expect(up.id).toBe('yes')
    expect(up.label).toBe('Up')
    expect(up.probability).toBeCloseTo(0.9805, 10)
    expect(up.price).toBe('0.9805')
    expect(down.label).toBe('Down')
    expect(down.probability).toBeCloseTo(0.0195, 10)
  })

  it('MERCADO CERRADO real: resuelto → ganador marcado y precios NUNCA 0%/100%', () => {
    const raw = parseMarket(resolvedFixture as unknown)
    expect(raw).not.toBeNull()
    if (raw === null) return
    // Fixture real: winningOutcomeIndex 1 y prices degenerados [0, 1].
    expect(raw.winningOutcomeIndex).toBe(1)

    const market = mapMarketToDomain(raw, VENUE, CHAIN_ID)
    expect(market).not.toBeNull()
    if (market === null) return

    expect(market.status).toBe('resolved')
    expect(market.isQuotable).toBe(false)
    const [yes, no] = market.outcomes
    expect(yes.isWinner).toBe(false)
    expect(no.isWinner).toBe(true)
    for (const outcome of market.outcomes) {
      expect(outcome.probability).toBeNull()
      expect(outcome.probability).not.toBe(0)
      expect(outcome.price).toBeNull()
      expect(outcome.isQuotable).toBe(false)
    }
    expect(isListable(market)).toBe(false)
    expect(isListable(market, { includeClosed: true, includeNonQuotable: true })).toBe(true)
  })

  it('MERCADO SIN COTIZACIÓN: LOCKED → suspendido y probabilidades null', () => {
    const locked: RawLimitlessMarket = { ...loadDetail(), status: 'LOCKED' }
    const market = mapMarketToDomain(locked, VENUE, CHAIN_ID)
    if (market === null) throw new Error('debería mapear')
    expect(market.status).toBe('suspended')
    expect(market.isQuotable).toBe(false)
    for (const outcome of market.outcomes) {
      expect(outcome.probability).toBeNull()
      expect(outcome.isQuotable).toBe(false)
    }
    expect(isListable(market)).toBe(false)
  })

  it('los mercados AMM heredados se descartan (otra escala y otra ejecución)', () => {
    const amm: RawLimitlessMarket = {
      ...loadDetail(),
      tradeType: 'amm',
      prices: [42.8, 57.2],
    }
    expect(mapMarketToDomain(amm, VENUE, CHAIN_ID)).toBeNull()
  })

  it('un grupo negRisk se despliega en un mercado por resultado', () => {
    const parsed = parseActivePage(groupsFixture as unknown)
    expect(parsed).not.toBeNull()
    if (parsed === null) return
    const item = parsed.value.items[0]
    expect(item.kind).toBe('group')
    if (item.kind !== 'group') return

    const markets = mapGroupToDomain(item.group, VENUE, CHAIN_ID)
    expect(markets.length).toBe(3)
    for (const market of markets) {
      expect(market.group?.id).toBe(item.group.slug)
      expect(market.group?.label).toBe(item.group.title)
      expect(market.question).toContain(item.group.title)
      expect(market.category).toBe('sports') // dominio 'sport' del fixture real
    }
  })
})

describe('mapCategory y mapStatus', () => {
  it('traduce el dominio del venue a la taxonomía propia', () => {
    const props = (domain: string) => [{ key: 'domain', values: [domain] }]
    expect(mapCategory(props('crypto'))).toBe('crypto')
    expect(mapCategory(props('finance'))).toBe('economy')
    expect(mapCategory(props('sport'))).toBe('sports')
    expect(mapCategory(props('politics'))).toBe('politics')
    expect(mapCategory(props('algo-nuevo'))).toBe('other')
    expect(mapCategory([])).toBe('other')
  })

  it('estados desconocidos degradan a suspended', () => {
    expect(mapStatus('FUNDED', false, false)).toBe('open')
    expect(mapStatus('FUNDED_FLAGGED', false, false)).toBe('open')
    expect(mapStatus('FUNDED', true, false)).toBe('closed') // deadline pasada
    expect(mapStatus('FUNDED', false, true)).toBe('suspended') // oculto
    expect(mapStatus('LOCKED', false, false)).toBe('suspended')
    expect(mapStatus('RESOLVED', true, false)).toBe('resolved')
    expect(mapStatus('DRAFT', false, false)).toBe('suspended')
    expect(mapStatus('ESTADO_NUEVO', false, false)).toBe('suspended')
  })
})

describe('matemática del libro (fixture real)', () => {
  function book() {
    const parsed = parseOrderbook(orderbookFixture as unknown)
    if (parsed === null) throw new Error('el fixture de libro no valida')
    return parsed
  }

  it('toPriceMilli acepta 3 decimales y rechaza el resto', () => {
    expect(toPriceMilli(0.037)).toBe(37)
    expect(toPriceMilli(0.998)).toBe(998)
    expect(toPriceMilli(0.9805)).toBeNull() // 4 decimales: no es nivel de orden
    expect(toPriceMilli(0)).toBeNull()
    expect(toPriceMilli(1)).toBeNull()
    expect(toPriceMilli(Number.NaN)).toBeNull()
  })

  it('SIN COTIZACIÓN EJECUTABLE real: el único ask YES está a 0.998, fuera del rango de orden', () => {
    expect(buyLevels(book(), 'yes')).toEqual([])
    expect(walkBuy(buyLevels(book(), 'yes'), 500000n)).toBeNull()
  })

  it('comprar NO refleja las pujas de YES (1 − precio)', () => {
    const levels = buyLevels(book(), 'no')
    // bids reales: 0.963→NO 0.037, 0.01→NO 0.99; 0.002→NO 0.998 inalcanzable.
    expect(levels.map((l) => l.priceMilli)).toEqual([37, 990])
    expect(levels[0].sizeRaw).toBe(26_000_000n)
  })

  it('recorre el libro con enteros: 0.5 USDC a 0.037 → 13.513513 acciones', () => {
    const walk = walkBuy(buyLevels(book(), 'no'), 500_000n)
    expect(walk).not.toBeNull()
    if (walk === null) return
    expect(walk.sharesRaw).toBe(13_513_513n)
    expect(walk.spentRaw).toBe(499_999n) // redondeo a la baja: nunca gasta de más
    expect(walk.worstPriceMilli).toBe(37)
    expect(priceImpactOf(walk)).toBe(0) // un solo nivel: sin impacto
  })

  it('cruzar niveles produce impacto > 0 y el libro agotado devuelve null', () => {
    const walk = walkBuy(buyLevels(book(), 'no'), 10_000_000n) // 10 USDC
    expect(walk).not.toBeNull()
    if (walk === null) return
    expect(walk.worstPriceMilli).toBe(990)
    expect(priceImpactOf(walk)).toBeGreaterThan(0)

    // 100.000 USDC: más que toda la liquidez del libro.
    expect(walkBuy(buyLevels(book(), 'no'), 100_000_000_000n)).toBeNull()
  })

  it('limitPriceMilli aplica slippage y respeta el rango 0.01..0.99', () => {
    expect(limitPriceMilli(37, 0.05)).toBe(39)
    expect(limitPriceMilli(985, 0.05)).toBe(990)
    expect(limitPriceMilli(5, 0)).toBe(10)
    expect(limitPriceMilli(500, 0)).toBe(500)
  })

  it('sizeFakBuy: precio × acciones exacto en unidades crudas', () => {
    const amounts = sizeFakBuy(500_000n, 39)
    expect(amounts).not.toBeNull()
    if (amounts === null) return
    expect(amounts.takerAmountRaw).toBe(12_820_000n)
    expect(amounts.makerAmountRaw).toBe(499_980n)
    // La exactitud que exige la API: makerAmount = price × takerAmount.
    expect((amounts.takerAmountRaw * 39n) % 1000n).toBe(0n)
    expect(amounts.makerAmountRaw).toBeLessThanOrEqual(500_000n)

    // Precio "redondo": no hace falta recortar acciones.
    const round = sizeFakBuy(500_000n, 500)
    expect(round?.takerAmountRaw).toBe(1_000_000n)
    expect(round?.makerAmountRaw).toBe(500_000n)

    // Importe por debajo del mínimo de la API (100 unidades crudas).
    expect(sizeFakBuy(50n, 500)).toBeNull()
  })
})

describe('autenticación HMAC', () => {
  it('coincide con la referencia de la doc (HMAC-SHA256, secreto base64)', async () => {
    // Vector calculado con la implementación de referencia de la doc oficial
    // (node:crypto): createHmac('sha256', Buffer.from(secret, 'base64'))
    // sobre `${timestamp}\nPOST\n/orders\n{"a":1}`.
    const secret = 'c2VjcmV0by1kZS1wcnVlYmE=' // "secreto-de-prueba"
    const frozen = new Date('2026-08-27T12:00:00.000Z')

    const headers = await buildHmacHeaders(
      { tokenId: 'tok-1', secret },
      'POST',
      '/orders',
      '{"a":1}',
      () => frozen,
    )

    expect(headers['lmts-api-key']).toBe('tok-1')
    expect(headers['lmts-timestamp']).toBe('2026-08-27T12:00:00.000Z')
    expect(headers['lmts-signature']).toBe('1ofQWsS6aZ8NUJRJwY2ySQZb5ITjWFzarhV6/83rJ3s=')
  })
})

describe('buildOrderTypedData', () => {
  it('construye el dominio y el mensaje EIP-712 documentados', () => {
    const typed = buildOrderTypedData({
      account: '0x2222222222222222222222222222222222222222',
      chainId: 8453,
      verifyingContract: '0x05c748E2f4DcDe0ec9Fa8DDc40DE6b867f923fa5',
      order: {
        salt: '1787842000000',
        maker: '0x2222222222222222222222222222222222222222',
        signer: '0x2222222222222222222222222222222222222222',
        taker: '0x0000000000000000000000000000000000000000',
        tokenId: '81803194125358692025171293455694422321933943885674142180864110845222451376492',
        makerAmount: 499980,
        takerAmount: 12820000,
        expiration: '0',
        nonce: 0,
        feeRateBps: 300,
        side: 0,
      },
    })

    expect(typed.domain.name).toBe('Limitless CTF Exchange')
    expect(typed.domain.version).toBe('1')
    expect(typed.domain.chainId).toBe(8453)
    expect(typed.domain.verifyingContract).toBe('0x05c748E2f4DcDe0ec9Fa8DDc40DE6b867f923fa5')
    expect(typed.primaryType).toBe('Order')
    expect(typed.message.salt).toBe(1787842000000n)
    expect(typed.message.makerAmount).toBe(499980n)
    expect(typed.message.takerAmount).toBe(12820000n)
    expect(typed.message.expiration).toBe(0n)
    expect(typed.message.nonce).toBe(0n)
    expect(typed.message.side).toBe(0)
    expect(typed.types.Order.map((f) => f.name)).toEqual([
      'salt', 'maker', 'signer', 'taker', 'tokenId', 'makerAmount',
      'takerAmount', 'expiration', 'nonce', 'feeRateBps', 'side', 'signatureType',
    ])
  })
})

describe('posiciones', () => {
  function loadPositions() {
    const parsed = parseClobPositions(positionsFixture as unknown)
    if (parsed === null) throw new Error('el fixture de posiciones no valida')
    expect(parsed.dropped).toBe(0)
    return parsed.value
  }

  it('mapea abierta, ganada reclamable, perdida y split reclamable', () => {
    const positions = loadPositions().flatMap((p) => mapClobPositionToDomain(p, VENUE))

    // Entrada 1: solo YES (NO con coste 0 se omite). Entrada 2: ambos lados.
    // Entrada 3 (split 50/50): YES reclamable.
    expect(positions.length).toBe(4)

    const open = positions[0]
    expect(open.marketId).toBe('limitless:btc-up-or-down-5-min-1787843400')
    expect(open.outcomeId).toBe('yes')
    expect(open.status).toBe('open')
    expect(open.stake).toBe('5')
    expect(open.potentialPayout).toBe('13.513513') // balance de acciones real
    expect(open.currentValue).toBe('6')
    expect(open.openedAt).toBeNull() // la API no da fecha: null, no inventada

    const won = positions[1]
    expect(won.outcomeId).toBe('yes')
    expect(won.status).toBe('redeemable')
    expect(won.potentialPayout).toBe('4')

    const lost = positions[2]
    expect(lost.outcomeId).toBe('no')
    expect(lost.status).toBe('lost')

    const split = positions[3]
    expect(split.status).toBe('redeemable')
  })

  it('sin balance de acciones, las deriva de coste ÷ precio medio', () => {
    const first = loadPositions()[0]
    const without = {
      ...first,
      yes: { ...first.yes, balanceRaw: null },
    }
    const [position] = mapClobPositionToDomain(without, VENUE)
    // 5 USDC a precio medio 0.37 → 13.513513 acciones.
    expect(position.potentialPayout).toBe('13.513513')
  })
})
