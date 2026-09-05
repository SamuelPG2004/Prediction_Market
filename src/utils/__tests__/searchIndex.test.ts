import { describe, expect, it } from 'vitest'
import type { MarketEventView } from '../eventGrouping.ts'
import {
  SUGGESTION_MIN_CHARS,
  buildSearchIndex,
  normalizeSearchText,
  querySearchIndex,
} from '../searchIndex.ts'

function eventView(
  overrides: Partial<MarketEventView> & { id: string; title: string },
): MarketEventView {
  return {
    markets: [],
    isBinary: false,
    liquidityUsd: null,
    volume24hUsd: null,
    totalVolumeUsd: null,
    isLive: false,
    ...overrides,
  }
}

const clasico = eventView({
  id: 'azuro:g1',
  title: 'Real Madrid - FC Barcelona',
  participants: [{ name: 'Real Madrid' }, { name: 'FC Barcelona' }],
  leagueName: 'La Liga',
})
const derbi = eventView({
  id: 'azuro:g2',
  title: 'Atlético de Madrid - Sevilla',
  participants: [{ name: 'Atlético de Madrid' }, { name: 'Sevilla' }],
  leagueName: 'La Liga',
})
const premier = eventView({
  id: 'azuro:g3',
  title: 'Arsenal - Chelsea',
  participants: [{ name: 'Arsenal' }, { name: 'Chelsea' }],
  leagueName: 'Premier League',
})
const sinLiga = eventView({ id: 'limitless:x', title: '¿Bitcoin a 100k?' })

describe('normalizeSearchText', () => {
  it('quita diacríticos, baja a minúsculas y recorta bordes', () => {
    expect(normalizeSearchText('  Atlético de MADRID ')).toBe(
      'atletico de madrid',
    )
    expect(normalizeSearchText('Fútbol Ñoño')).toBe('futbol nono')
  })
})

describe('buildSearchIndex', () => {
  it('indexa cada evento con título, participantes y liga normalizados', () => {
    const index = buildSearchIndex([clasico, sinLiga])
    expect(index.events.length).toBe(2)
    expect(index.events[0].normalizedName).toContain('real madrid')
    expect(index.events[0].normalizedName).toContain('la liga')
    expect(index.events[1].normalizedName).toBe('¿bitcoin a 100k?')
  })

  it('deduplica ligas por nombre normalizado y ordena por oferta', () => {
    const index = buildSearchIndex([premier, clasico, derbi])
    expect(index.leagues.map((l) => l.name)).toEqual([
      'La Liga',
      'Premier League',
    ])
    expect(index.leagues[0].eventCount).toBe(2)
    expect(index.leagues[0].normalizedName).toBe('la liga')
  })

  it('un evento sin liga no aporta entrada de liga', () => {
    const index = buildSearchIndex([sinLiga])
    expect(index.leagues).toEqual([])
  })
})

describe('querySearchIndex', () => {
  const index = buildSearchIndex([clasico, derbi, premier, sinLiga])

  it('casa una parte del nombre de un equipo', () => {
    const { events } = querySearchIndex(index, 'Madrid')
    expect(events.map((e) => e.event.id)).toEqual(['azuro:g1', 'azuro:g2'])
  })

  it('casa una parte del nombre de la liga, en ambas secciones', () => {
    const result = querySearchIndex(index, 'Premier')
    expect(result.leagues.map((l) => l.name)).toEqual(['Premier League'])
    expect(result.events.map((e) => e.event.id)).toEqual(['azuro:g3'])
  })

  it('ignora acentos en las dos direcciones', () => {
    expect(querySearchIndex(index, 'atletico').events.length).toBe(1)
    expect(querySearchIndex(index, 'Atlético').events.length).toBe(1)
  })

  it(`devuelve vacío por debajo de ${SUGGESTION_MIN_CHARS} caracteres útiles`, () => {
    expect(querySearchIndex(index, 'ma')).toEqual({ leagues: [], events: [] })
    expect(querySearchIndex(index, '  ma  ')).toEqual({
      leagues: [],
      events: [],
    })
  })

  it('recorta las listas: sugerir no es volcar el catálogo', () => {
    const muchos = buildSearchIndex(
      Array.from({ length: 20 }, (_, i) =>
        eventView({
          id: `azuro:m${i}`,
          title: `Madrid ${i} - Rival`,
          leagueName: `Liga Madrid ${i}`,
        }),
      ),
    )
    const result = querySearchIndex(muchos, 'madrid')
    expect(result.events.length).toBe(8)
    expect(result.leagues.length).toBe(4)
  })
})
