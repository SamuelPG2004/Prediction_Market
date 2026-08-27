/**
 * Tests de validación y mapeo con fixtures REALES del Backend API de Azuro
 * (ver fixtures/README.md). Sin red: todo entra como `unknown` por los
 * parseadores, igual que en producción.
 */
import { describe, expect, it } from 'vitest'
import { isListable } from '../../../domain/types.ts'
import {
  makeNativeId,
  mapConditionToMarket,
  mapOrderToPosition,
  mapStatus,
  numberToDecimal,
  parseNativeId,
} from '../mappers.ts'
import {
  parseBetOrders,
  parseConditions,
  parseGamesPage,
  type RawCondition,
  type RawGame,
} from '../validate.ts'
import betOrdersFixture from './fixtures/bets-by-bettor.synthetic.json'
import conditionsFixture from './fixtures/conditions-by-game.json'
import gamesFixture from './fixtures/games-prematch.json'

const CHAIN_ID = 137
const VENUE = 'azuro'

// Anclas de los fixtures (ver README): un juego parado y uno prematch con
// una condición activa "Total Games" de cuotas 2.17 / 1.65.
const STOPPED_GAME_ID = '1006000000000030699275'
const PREMATCH_GAME_ID = '1006000000000030696510'
const ACTIVE_CONDITION_ID = '300610060000000000306965100000000000009043317948'

function loadGames(): RawGame[] {
  const parsed = parseGamesPage(gamesFixture as unknown)
  if (parsed === null) throw new Error('el fixture de juegos no valida')
  return parsed.value.games
}

function loadConditions(): RawCondition[] {
  const parsed = parseConditions(conditionsFixture as unknown)
  if (parsed === null) throw new Error('el fixture de condiciones no valida')
  return parsed.value
}

function gameById(id: string): RawGame {
  const game = loadGames().find((g) => g.gameId === id)
  if (game === undefined) throw new Error(`falta el juego ${id} en el fixture`)
  return game
}

function conditionById(id: string): RawCondition {
  const condition = loadConditions().find((c) => c.conditionId === id)
  if (condition === undefined) {
    throw new Error(`falta la condición ${id} en el fixture`)
  }
  return condition
}

describe('validación de fixtures reales', () => {
  it('la página de juegos real valida sin descartar nada', () => {
    const parsed = parseGamesPage(gamesFixture as unknown)
    expect(parsed).not.toBeNull()
    expect(parsed?.dropped).toBe(0)
    expect(parsed?.value.games.length).toBe(10)
  })

  it('las condiciones reales validan sin descartar nada', () => {
    const parsed = parseConditions(conditionsFixture as unknown)
    expect(parsed).not.toBeNull()
    expect(parsed?.dropped).toBe(0)
    expect(parsed?.value.length).toBeGreaterThan(0)
  })

  it('una respuesta malformada devuelve null en vez de colar', () => {
    expect(parseGamesPage({ foo: 'bar' })).toBeNull()
    expect(parseGamesPage('cadena inesperada')).toBeNull()
    expect(parseConditions({ conditions: [] })).toBeNull()
  })

  it('un juego sin campos obligatorios se descarta, el resto sobrevive', () => {
    const mutated = {
      ...(gamesFixture as Record<string, unknown>),
      games: [
        ...(gamesFixture as { games: unknown[] }).games,
        { title: 'Juego sin gameId' },
      ],
    }
    const parsed = parseGamesPage(mutated)
    expect(parsed).not.toBeNull()
    expect(parsed?.dropped).toBe(1)
    expect(parsed?.value.games.length).toBe(10)
  })
})

describe('mapConditionToMarket', () => {
  it('mapea una condición activa real a un mercado abierto y cotizable', () => {
    const market = mapConditionToMarket(
      gameById(PREMATCH_GAME_ID),
      conditionById(ACTIVE_CONDITION_ID),
      VENUE,
      CHAIN_ID,
    )

    expect(market.id).toBe(
      `azuro:${makeNativeId(PREMATCH_GAME_ID, ACTIVE_CONDITION_ID)}`,
    )
    expect(market.venue).toBe(VENUE)
    expect(market.chainId).toBe(CHAIN_ID)
    expect(market.status).toBe('open')
    expect(market.isQuotable).toBe(true)
    expect(market.category).toBe('sports')
    expect(market.subcategory).toBe('tennis')
    expect(market.priceFormat).toBe('decimal-odds')
    expect(market.question).toContain('Sebastian Heinrich - Luca Wiedenmann')
    expect(market.question).toContain('Total Games')
    expect(market.group?.id).toBe(PREMATCH_GAME_ID)
    expect(market.closesAt).toEqual(new Date(1787842200 * 1000))
    // Métricas que Azuro no aporta por mercado: null, no un 0 inventado.
    expect(market.liquidityUsd).toBeNull()
    expect(market.volume24hUsd).toBeNull()

    const over = market.outcomes.find((o) => o.id === '405')
    expect(over?.price).toBe('2.17')
    expect(over?.probability).toBeCloseTo(1 / 2.17, 10)
    expect(over?.isQuotable).toBe(true)
    expect(over?.isWinner).toBeUndefined()
  })

  it('MERCADO SIN COTIZACIÓN: condición parada → probability null, jamás 0%', () => {
    const stopped = loadConditions().filter(
      (c) => c.gameId === STOPPED_GAME_ID && c.state === 'Stopped',
    )
    expect(stopped.length).toBeGreaterThan(0)

    for (const condition of stopped) {
      const market = mapConditionToMarket(
        gameById(STOPPED_GAME_ID),
        condition,
        VENUE,
        CHAIN_ID,
      )
      expect(market.status).toBe('suspended')
      expect(market.isQuotable).toBe(false)
      for (const outcome of market.outcomes) {
        expect(outcome.probability).toBeNull()
        expect(outcome.probability).not.toBe(0)
        expect(outcome.price).toBeNull()
        expect(outcome.isQuotable).toBe(false)
      }
      // Y por defecto no se lista.
      expect(isListable(market)).toBe(false)
    }
  })

  it('MERCADO CERRADO: condición resuelta → resolved, ganador marcado y fuera del listado', () => {
    // Variante derivada del fixture real: misma condición, estado Resolved.
    const resolved: RawCondition = {
      ...conditionById(ACTIVE_CONDITION_ID),
      state: 'Resolved',
      wonOutcomeIds: ['405'],
    }
    const market = mapConditionToMarket(
      gameById(PREMATCH_GAME_ID),
      resolved,
      VENUE,
      CHAIN_ID,
    )

    expect(market.status).toBe('resolved')
    expect(market.isQuotable).toBe(false)
    expect(market.outcomes.find((o) => o.id === '405')?.isWinner).toBe(true)
    expect(market.outcomes.find((o) => o.id === '406')?.isWinner).toBe(false)
    for (const outcome of market.outcomes) {
      expect(outcome.probability).toBeNull()
      expect(outcome.price).toBeNull()
    }
    expect(isListable(market)).toBe(false)
    // Solo aparece pidiéndolo explícitamente.
    expect(
      isListable(market, { includeClosed: true, includeNonQuotable: true }),
    ).toBe(true)
  })

  it('un juego terminado sin resolver cierra el mercado', () => {
    const finishedGame: RawGame = { ...gameById(PREMATCH_GAME_ID), state: 'Finished' }
    const market = mapConditionToMarket(
      finishedGame,
      conditionById(ACTIVE_CONDITION_ID),
      VENUE,
      CHAIN_ID,
    )
    expect(market.status).toBe('closed')
    expect(market.isQuotable).toBe(false)
  })

  it('un juego en vivo no tiene closesAt (no se debe ocultar por hora pasada)', () => {
    const liveGame: RawGame = { ...gameById(PREMATCH_GAME_ID), state: 'Live' }
    const market = mapConditionToMarket(
      liveGame,
      conditionById(ACTIVE_CONDITION_ID),
      VENUE,
      CHAIN_ID,
    )
    expect(market.status).toBe('open')
    expect(market.closesAt).toBeNull()
  })

  it('una cuota corrupta o imposible no se convierte en probabilidad', () => {
    const base = conditionById(ACTIVE_CONDITION_ID)
    const corrupted: RawCondition = {
      ...base,
      outcomes: [
        { ...base.outcomes[0], odds: 'no-es-un-numero' },
        // Cuota <= 1: pagaría menos de lo apostado; no es cotización real.
        { ...base.outcomes[1], odds: '0.5' },
      ],
    }
    const market = mapConditionToMarket(
      gameById(PREMATCH_GAME_ID),
      corrupted,
      VENUE,
      CHAIN_ID,
    )
    for (const outcome of market.outcomes) {
      expect(outcome.probability).toBeNull()
      expect(outcome.isQuotable).toBe(false)
    }
    expect(market.isQuotable).toBe(false)
  })
})

describe('mapStatus: estados desconocidos degradan a suspended', () => {
  it('cubre la matriz juego × condición', () => {
    expect(mapStatus('Prematch', 'Active', false)).toBe('open')
    expect(mapStatus('Live', 'Active', false)).toBe('open')
    expect(mapStatus('Stopped', 'Active', false)).toBe('suspended')
    expect(mapStatus('Finished', 'Active', false)).toBe('closed')
    expect(mapStatus('Canceled', 'Active', false)).toBe('closed')
    expect(mapStatus('Prematch', 'Stopped', false)).toBe('suspended')
    expect(mapStatus('Prematch', 'Resolved', false)).toBe('resolved')
    expect(mapStatus('Prematch', 'Canceled', false)).toBe('closed')
    expect(mapStatus('Prematch', 'Removed', false)).toBe('closed')
    // Condición oculta por el venue: no se enseña como apostable.
    expect(mapStatus('Prematch', 'Active', true)).toBe('suspended')
    // Valores que el servidor pueda inventar mañana.
    expect(mapStatus('EstadoNuevo', 'Active', false)).toBe('suspended')
    expect(mapStatus('Prematch', 'EstadoNuevo', false)).toBe('suspended')
  })
})

describe('numberToDecimal', () => {
  it('convierte números del venue sin notación científica ni negativos', () => {
    expect(numberToDecimal(5)).toBe('5')
    expect(numberToDecimal(5.5)).toBe('5.5')
    expect(numberToDecimal(0)).toBe('0')
    expect(numberToDecimal(21.7)).toBe('21.7')
    expect(numberToDecimal(-1)).toBeNull()
    expect(numberToDecimal(Number.NaN)).toBeNull()
    expect(numberToDecimal(Number.POSITIVE_INFINITY)).toBeNull()
  })
})

describe('parseNativeId', () => {
  it('descompone y rechaza formas inválidas', () => {
    expect(parseNativeId(makeNativeId('g1', 'c1'))).toEqual({
      gameId: 'g1',
      conditionId: 'c1',
    })
    expect(parseNativeId('sin-separador')).toBeNull()
    expect(parseNativeId('/empiezaporbarra')).toBeNull()
    expect(parseNativeId('terminaenbarra/')).toBeNull()
  })
})

describe('mapOrderToPosition', () => {
  const titles = new Map([
    ['1006000000000030696510', 'Sebastian Heinrich - Luca Wiedenmann'],
    ['1006000000000030699275', 'Lan Mi - Isabella Barrera Aguirre'],
  ])

  function loadOrders() {
    const parsed = parseBetOrders(betOrdersFixture as unknown)
    if (parsed === null) throw new Error('el fixture de órdenes no valida')
    return parsed.value
  }

  it('el fixture de órdenes valida entero', () => {
    expect(loadOrders().length).toBe(5)
  })

  it('mapea abierta, ganada sin cobrar y perdida; salta combos y rechazadas', () => {
    const positions = loadOrders()
      .map((order) => mapOrderToPosition(order, titles, VENUE))
      .filter((p) => p !== null)

    // 5 órdenes: abierta + ganada + perdida; el combo y la rechazada se saltan.
    expect(positions.length).toBe(3)

    const open = positions[0]
    expect(open.status).toBe('open')
    expect(open.stake).toBe('10')
    expect(open.potentialPayout).toBe('21.7') // 10 × 2.17
    expect(open.marketQuestion).toContain('Sebastian Heinrich')
    expect(open.outcomeLabel.length).toBeGreaterThan(0)
    expect(open.openedAt).toEqual(new Date('2026-08-26T12:00:00.000Z'))

    const won = positions[1]
    expect(won.status).toBe('redeemable') // ganada y sin cobrar
    expect(won.potentialPayout).toBe('8.25') // payout liquidado real

    const lost = positions[2]
    expect(lost.status).toBe('lost')
  })

  it('una ganada ya cobrada pasa a redeemed', () => {
    const won = loadOrders()[1]
    const redeemed = { ...won, redeemedAt: '2026-08-26T00:00:00.000Z' }
    expect(mapOrderToPosition(redeemed, titles, VENUE)?.status).toBe('redeemed')
  })

  it('una condición cancelada se puede reclamar (devolución)', () => {
    const open = loadOrders()[0]
    const canceled = { ...open, state: 'Settled', result: 'Canceled' }
    expect(mapOrderToPosition(canceled, titles, VENUE)?.status).toBe('redeemable')
  })
})
