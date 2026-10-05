import { afterEach, describe, expect, it } from 'vitest'
import { toDecimal, type Market } from '../../domain/types'
import { BET_SLIP_LIMIT, toggleSelection, useBetSlipStore } from '../useBetSlip'

function makeMarket(id: string): Market {
  return {
    id,
    venue: 'azuro',
    chainId: 137,
    question: `Pregunta ${id}`,
    category: 'sports',
    outcomes: [
      { id: 'home', label: 'Local', probability: 0.5, price: toDecimal('2'), isQuotable: true },
      { id: 'away', label: 'Visita', probability: 0.5, price: toDecimal('2'), isQuotable: true },
    ],
    status: 'open',
    closesAt: null,
    liquidityUsd: null,
    volume24hUsd: null,
    isQuotable: true,
    priceFormat: 'decimal-odds',
  }
}

afterEach(() => {
  useBetSlipStore.setState({ selections: [], isOpen: false })
})

describe('Zustand bets slip store', () => {
  it('adds a clicked outcome and opens the slip', () => {
    const market = makeMarket('azuro:1')

    toggleSelection('Local vs visita', market, 'home')

    expect(useBetSlipStore.getState().selections).toEqual([
      { market, outcomeId: 'home', eventTitle: 'Local vs visita' },
    ])
    expect(useBetSlipStore.getState().isOpen).toBe(true)
  })

  it('toggles the same outcome off and replaces another outcome on that market', () => {
    const market = makeMarket('azuro:1')
    toggleSelection('Partido', market, 'home')
    toggleSelection('Partido', market, 'away')

    expect(useBetSlipStore.getState().selections).toHaveLength(1)
    expect(useBetSlipStore.getState().selections[0]?.outcomeId).toBe('away')

    toggleSelection('Partido', market, 'away')
    expect(useBetSlipStore.getState().selections).toHaveLength(0)
  })

  it('enforces the selection cap while allowing a replacement at the cap', () => {
    for (let index = 0; index < BET_SLIP_LIMIT; index++) {
      toggleSelection('Partido', makeMarket(`azuro:${index}`), 'home')
    }
    const before = useBetSlipStore.getState().selections

    toggleSelection('Partido extra', makeMarket('azuro:extra'), 'home')
    expect(useBetSlipStore.getState().selections).toEqual(before)

    toggleSelection('Partido reemplazado', makeMarket('azuro:0'), 'away')
    expect(useBetSlipStore.getState().selections).toHaveLength(BET_SLIP_LIMIT)
    expect(
      useBetSlipStore.getState().selections.find(
        (selection) => selection.market.id === 'azuro:0',
      )?.outcomeId,
    ).toBe('away')
  })
})
