import { describe, expect, it } from 'vitest'
import type { Market } from '../../domain/types.ts'
import { groupMarketsIntoEvents, optionLabelOf } from '../eventGrouping.ts'

function market(overrides: Partial<Market> & { id: string }): Market {
  return {
    venue: 'azuro',
    chainId: 137,
    question: 'Pregunta',
    category: 'sports',
    outcomes: [
      { id: '1', label: 'A', probability: 0.5, price: null, isQuotable: true },
      { id: '2', label: 'B', probability: 0.5, price: null, isQuotable: true },
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

describe('groupMarketsIntoEvents', () => {
  it('agrupa por grupo del venue y respeta el orden de aparición', () => {
    const partido = { id: 'g1', label: 'Equipo A - Equipo B' }
    const events = groupMarketsIntoEvents([
      market({ id: 'azuro:g1/c1', group: partido, question: 'Equipo A - Equipo B · 1X2' }),
      market({ id: 'azuro:s1', question: 'Mercado suelto' }),
      market({ id: 'azuro:g1/c2', group: partido, question: 'Equipo A - Equipo B · Total' }),
    ])

    expect(events.length).toBe(2)
    expect(events[0].id).toBe('azuro:g1')
    expect(events[0].title).toBe('Equipo A - Equipo B')
    expect(events[0].markets.length).toBe(2)
    expect(events[0].isBinary).toBe(false)
    expect(events[1].id).toBe('azuro:s1')
    expect(events[1].isBinary).toBe(true)
  })

  it('no mezcla grupos con el mismo id de venues distintos', () => {
    const events = groupMarketsIntoEvents([
      market({ id: 'azuro:g1/c1', group: { id: 'g1', label: 'De Azuro' } }),
      market({
        id: 'limitless:x',
        venue: 'limitless',
        group: { id: 'g1', label: 'De Limitless' },
      }),
    ])
    expect(events.length).toBe(2)
  })

  it('suma métricas conocidas y deja null cuando nadie las aporta', () => {
    const grupo = { id: 'g', label: 'G' }
    const [event] = groupMarketsIntoEvents([
      market({ id: 'a:1', group: grupo, liquidityUsd: 100 }),
      market({ id: 'a:2', group: grupo, liquidityUsd: 50 }),
    ])
    expect(event.liquidityUsd).toBe(150)
    expect(event.volume24hUsd).toBeNull()
  })
})

describe('optionLabelOf', () => {
  it('recorta el prefijo del grupo cuando existe', () => {
    const m = market({
      id: 'a:1',
      group: { id: 'g', label: 'Partido' },
      question: 'Partido · Total Games',
    })
    expect(optionLabelOf(m)).toBe('Total Games')
    expect(optionLabelOf(market({ id: 'a:2', question: 'Suelta' }))).toBe('Suelta')
  })
})
