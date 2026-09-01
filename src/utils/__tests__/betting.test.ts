import { describe, expect, it } from 'vitest'
import { toDecimal, type Market } from '../../domain/types.ts'
import {
  checkComboAvailability,
  isValidAmount,
  outcomeOddsText,
  previewComboOdds,
  selectionOddsText,
} from '../betting.ts'

function market(overrides: Partial<Market> & { id: string }): Market {
  return {
    venue: 'azuro',
    chainId: 137,
    question: 'Pregunta',
    category: 'sports',
    outcomes: [
      { id: '1', label: 'A', probability: 0.5, price: toDecimal('1.85'), isQuotable: true },
      { id: '2', label: 'B', probability: 0.5, price: toDecimal('2.10'), isQuotable: true },
    ],
    status: 'open',
    closesAt: null,
    liquidityUsd: null,
    volume24hUsd: null,
    isQuotable: true,
    priceFormat: 'decimal-odds',
    ...overrides,
  }
}

describe('isValidAmount', () => {
  it('acepta decimales positivos con hasta 6 decimales', () => {
    expect(isValidAmount('10')).toBe(true)
    expect(isValidAmount('0.000001')).toBe(true)
    expect(isValidAmount(' 12.5 ')).toBe(true)
  })

  it('rechaza cero, negativos, vacío y formatos raros', () => {
    expect(isValidAmount('')).toBe(false)
    expect(isValidAmount('0')).toBe(false)
    expect(isValidAmount('0.0')).toBe(false)
    expect(isValidAmount('-5')).toBe(false)
    expect(isValidAmount('10.')).toBe(false)
    expect(isValidAmount('.5')).toBe(false)
    expect(isValidAmount('1e5')).toBe(false)
    expect(isValidAmount('0.0000001')).toBe(false) // 7 decimales
    expect(isValidAmount('10,5')).toBe(false)
  })
})

describe('previewComboOdds', () => {
  it('multiplica las cuotas de las patas', () => {
    const odds = previewComboOdds([
      { market: market({ id: 'a:1' }), outcomeId: '1' }, // 1.85
      { market: market({ id: 'a:2' }), outcomeId: '2' }, // 2.10
    ])
    expect(odds).toBeCloseTo(1.85 * 2.1, 10)
  })

  it('devuelve null si una pata no tiene cuota decimal', () => {
    const sinPrecio = market({
      id: 'a:2',
      outcomes: [
        { id: '1', label: 'A', probability: null, price: null, isQuotable: false },
        { id: '2', label: 'B', probability: 0.5, price: toDecimal('2.10'), isQuotable: true },
      ],
    })
    expect(
      previewComboOdds([
        { market: market({ id: 'a:1' }), outcomeId: '1' },
        { market: sinPrecio, outcomeId: '1' },
      ]),
    ).toBeNull()

    const porcentual = market({ id: 'l:1', priceFormat: 'probability' })
    expect(
      previewComboOdds([
        { market: market({ id: 'a:1' }), outcomeId: '1' },
        { market: porcentual, outcomeId: '1' },
      ]),
    ).toBeNull()
  })

  it('devuelve null si el outcome no existe en el mercado', () => {
    expect(
      previewComboOdds([
        { market: market({ id: 'a:1' }), outcomeId: 'inexistente' },
        { market: market({ id: 'a:2' }), outcomeId: '1' },
      ]),
    ).toBeNull()
  })
})

describe('checkComboAvailability', () => {
  const caps = { displayName: 'Azuro', canCombo: true }
  const g = (id: string) => ({ id, label: `Partido ${id}` })

  it('acepta dos patas del mismo venue en partidos distintos', () => {
    const check = checkComboAvailability(
      [
        { market: market({ id: 'a:1', group: g('g1') }) },
        { market: market({ id: 'a:2', group: g('g2') }) },
      ],
      caps,
    )
    expect(check).toEqual({ available: true, reason: null })
  })

  it('pide al menos dos selecciones', () => {
    const check = checkComboAvailability(
      [{ market: market({ id: 'a:1', group: g('g1') }) }],
      caps,
    )
    expect(check.available).toBe(false)
    expect(check.reason).toMatch(/al menos dos/)
  })

  it('rechaza mezclar venues', () => {
    const check = checkComboAvailability(
      [
        { market: market({ id: 'a:1', group: g('g1') }) },
        { market: market({ id: 'l:1', venue: 'limitless', group: g('g2') }) },
      ],
      null,
    )
    expect(check.available).toBe(false)
    expect(check.reason).toMatch(/mezclan/)
  })

  it('rechaza un venue sin combinadas, con su nombre en el motivo', () => {
    const check = checkComboAvailability(
      [
        { market: market({ id: 'l:1', venue: 'limitless', group: g('g1') }) },
        { market: market({ id: 'l:2', venue: 'limitless', group: g('g2') }) },
      ],
      { displayName: 'Limitless', canCombo: false },
    )
    expect(check.available).toBe(false)
    expect(check.reason).toMatch(/Limitless no ofrece/)
  })

  it('rechaza dos patas del mismo partido, o sin partido', () => {
    const mismoPartido = checkComboAvailability(
      [
        { market: market({ id: 'a:1', group: g('g1') }) },
        { market: market({ id: 'a:2', group: g('g1') }) },
      ],
      caps,
    )
    expect(mismoPartido.available).toBe(false)
    expect(mismoPartido.reason).toMatch(/mismo partido/)

    const sinPartido = checkComboAvailability(
      [
        { market: market({ id: 'a:1' }) },
        { market: market({ id: 'a:2', group: g('g2') }) },
      ],
      caps,
    )
    expect(sinPartido.available).toBe(false)
  })
})

describe('outcomeOddsText / selectionOddsText', () => {
  it('cuota decimal en venues de cuotas', () => {
    const m = market({ id: 'a:1' })
    expect(selectionOddsText(m, '1')).toBe('1.85')
  })

  it('porcentaje en venues de probabilidad', () => {
    const m = market({
      id: 'l:1',
      priceFormat: 'probability',
      outcomes: [
        { id: '1', label: 'Sí', probability: 0.62, price: toDecimal('0.62'), isQuotable: true },
      ],
    })
    expect(selectionOddsText(m, '1')).toBe('62%')
  })

  it('raya cuando no hay precio ni resultado, jamás 0', () => {
    const m = market({
      id: 'a:1',
      outcomes: [
        { id: '1', label: 'A', probability: null, price: null, isQuotable: false },
      ],
    })
    expect(selectionOddsText(m, '1')).toBe('—')
    expect(selectionOddsText(m, 'no-existe')).toBe('—')
    expect(outcomeOddsText(m, undefined)).toBe('—')
  })
})
