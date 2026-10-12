import { describe, expect, it } from 'vitest'
import { toDecimal, type Market } from '../../domain/types'
import { findStarMarket, marketGroupShapeOf, marketLineOf } from '../eventGrouping'
import { displaySportsMarket, sportsMarketCategory, sortedSportsGroups } from '../sportsMarkets'
import { translateMarketLabel, translateOutcomeLabel } from '../marketLabels'
function market(id: string, label: string, available = true): Market {
  return { id, venue: 'test', chainId: 137, category: 'sports', question: `Partido · ${label}`,
    group: { id: 'game', label: 'Partido' }, status: available ? 'open' : 'suspended', closesAt: null,
    priceFormat: 'decimal-odds', isQuotable: available, liquidityUsd: null, volume24hUsd: null,
    outcomes: [{ id: `${id}:over`, label: 'Over 2.5', price: available ? toDecimal('1.90') : null, probability: available ? 0.52 : null, isQuotable: available },
      { id: `${id}:under`, label: 'Under 2.5', price: available ? toDecimal('1.95') : null, probability: available ? 0.51 : null, isQuotable: available }] }
}
describe('mercados de sportsbook', () => {
  it('reconoce Match Result y tiempo reglamentario en tarjetas con varias condiciones', () => {
    const total = market('total', 'Total Goals Over/Under')
    for (const label of ['Match Result', 'Match Result (Regular Time)', 'Winner of Match']) {
      const winner = market('winner', label)
      expect(findStarMarket([total, winner])?.id).toBe('winner')
      expect(displaySportsMarket([total, winner])?.id).toBe('winner')
    }
  })
  it('muestra una alternativa real si el ganador está suspendido o no existe', () => {
    const total = market('total', 'Total Goals Over/Under')
    expect(displaySportsMarket([market('winner', 'Match Result', false), total])?.id).toBe('total')
    expect(displaySportsMarket([market('micro', '(00:00 - 09:59) - Total Goals'), total])?.id).toBe('total')
    expect(displaySportsMarket([])).toBeNull()
  })
  it('conserva la suspensión y los precios null cuando no hay cuotas', () => {
    const m = displaySportsMarket([market('winner', 'Match Result', false)])
    expect(m?.isQuotable).toBe(false)
    expect(m?.outcomes.every(o => o.price === null)).toBe(true)
  })
  it('clasifica categorías sin perder mercados ni ids', () => {
    const labels = ['Match Result', 'Total Goals Over/Under', 'Asian Handicap (0-0)', '1st Half - Total Goals Over/Under', 'Total Corners Over/Under', 'Total Cards Over/Under', 'Mercado desconocido']
    expect(labels.map((label, i) => sportsMarketCategory(market(String(i), label)))).toEqual(['main', 'totals', 'handicap', 'periods', 'corners', 'cards', 'other'])
    const inputs = labels.map((label, i) => market(String(i), label))
    expect(sortedSportsGroups(inputs).flatMap(g => g.markets).map(m => m.id).sort()).toEqual(inputs.map(m => m.id).sort())
  })
  it('reconoce líneas Más/Menos sin paréntesis y traduce sus resultados', () => {
    const total = market('total', 'Total Goals Over/Under')
    expect(marketLineOf(total)).toBe(2.5)
    expect(marketGroupShapeOf([total])).toBe('over-under')
    expect(translateMarketLabel('Match Result')).toBe('Resultado del partido')
    expect(translateMarketLabel('Total Goals Over/Under')).toBe('Goles totales')
    expect(translateOutcomeLabel('Over 2.5')).toBe('Más de 2.5')
    expect(translateOutcomeLabel('Under (2.5)')).toBe('Menos de 2.5')
  })
})
