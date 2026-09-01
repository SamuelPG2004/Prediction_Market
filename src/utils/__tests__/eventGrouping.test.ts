import { describe, expect, it } from 'vitest'
import type { Market } from '../../domain/types.ts'
import {
  groupEventsForList,
  groupMarketsIntoEvents,
  marketGroupShapeOf,
  optionLabelOf,
  outcomeLineOf,
} from '../eventGrouping.ts'

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
      question: 'Partido · Mercado Raro',
    })
    expect(optionLabelOf(m)).toBe('Mercado Raro')
    expect(optionLabelOf(market({ id: 'a:2', question: 'Suelta' }))).toBe('Suelta')
  })

  it('traduce la etiqueta del venue al español', () => {
    const m = market({
      id: 'a:1',
      group: { id: 'g', label: 'Partido' },
      question: 'Partido · Total Games',
    })
    expect(optionLabelOf(m)).toBe('Juegos totales')
  })
})

describe('marketGroupShapeOf', () => {
  const outcomes = (labels: string[]) =>
    labels.map((label, i) => ({
      id: String(i + 1),
      label,
      probability: 0.5,
      price: null,
      isQuotable: true,
    }))

  it('detecta un grupo de totales Más/Menos', () => {
    const shape = marketGroupShapeOf([
      market({ id: 'a:1', outcomes: outcomes(['Over (17.5)', 'Under (17.5)']) }),
      market({ id: 'a:2', outcomes: outcomes(['Under (18.5)', 'Over (18.5)']) }),
    ])
    expect(shape).toBe('over-under')
  })

  it('detecta un grupo a dos bandas por participantes', () => {
    const participants = [{ name: 'Lan Mi' }, { name: 'Sebastian Heinrich' }]
    const shape = marketGroupShapeOf(
      [
        market({
          id: 'a:1',
          outcomes: outcomes(['Lan Mi (-7)', 'Sebastian Heinrich (7)']),
        }),
        market({
          id: 'a:2',
          outcomes: outcomes(['Sebastian Heinrich (7.5)', 'Lan Mi (-7.5)']),
        }),
      ],
      participants,
    )
    expect(shape).toBe('two-sided')
  })

  it('cae a lista cuando un mercado no encaja', () => {
    const shape = marketGroupShapeOf(
      [
        market({ id: 'a:1', outcomes: outcomes(['Over (2.5)', 'Under (2.5)']) }),
        market({ id: 'a:2', outcomes: outcomes(['Odd', 'Even']) }),
      ],
      [{ name: 'A' }, { name: 'B' }],
    )
    expect(shape).toBe('list')
  })
})

describe('outcomeLineOf', () => {
  it('extrae la línea con signo del resultado', () => {
    expect(outcomeLineOf('Lan Mi (-7.5)')).toBe('-7.5')
    expect(outcomeLineOf('Beatrise Zeltina (1.5)')).toBe('1.5')
    expect(outcomeLineOf('Empate')).toBeNull()
  })
})

describe('groupEventsForList', () => {
  const NOW = new Date(2026, 8, 1, 12, 0) // 1 sept 2026
  const at = (d: Date) => d

  function event(
    id: string,
    opts: { closesAt?: Date | null; league?: string; isLive?: boolean },
  ) {
    const m = market({
      id,
      closesAt: opts.closesAt === undefined ? null : opts.closesAt,
    })
    return {
      id,
      title: id,
      markets: [m],
      isBinary: true,
      liquidityUsd: null,
      volume24hUsd: null,
      totalVolumeUsd: null,
      isLive: opts.isLive === true,
      ...(opts.league !== undefined ? { leagueName: opts.league } : {}),
    }
  }

  it('en juego primero, luego por día, y las ligas en orden de aparición', () => {
    const days = groupEventsForList(
      [
        event('hoy-liga-b', { closesAt: at(new Date(2026, 8, 1, 18)), league: 'B' }),
        event('manana', { closesAt: at(new Date(2026, 8, 2, 10)), league: 'A' }),
        event('vivo', { closesAt: at(new Date(2026, 8, 1, 11)), isLive: true, league: 'A' }),
        event('hoy-liga-a', { closesAt: at(new Date(2026, 8, 1, 20)), league: 'A' }),
      ],
      NOW,
    )
    expect(days.map((d) => d.label)).toEqual(['En juego', 'Hoy', 'Mañana'])
    expect(days[1].leagues.map((l) => l.league)).toEqual(['B', 'A'])
    expect(days[0].leagues[0].events[0].id).toBe('vivo')
  })

  it('sin liga cae en Otros; sin fecha, al final', () => {
    const days = groupEventsForList(
      [
        event('sin-fecha', { closesAt: null }),
        event('hoy', { closesAt: at(new Date(2026, 8, 1, 18)) }),
      ],
      NOW,
    )
    expect(days.map((d) => d.label)).toEqual(['Hoy', 'Sin fecha'])
    expect(days[0].leagues[0].league).toBe('Otros')
  })

  it('etiqueta con la fecha corta los días más lejanos', () => {
    const days = groupEventsForList(
      [event('finde', { closesAt: at(new Date(2026, 8, 5, 10)), league: 'X' })],
      NOW,
    )
    expect(days[0].label).toMatch(/5/)
    expect(days[0].label).not.toBe('Hoy')
  })
})
