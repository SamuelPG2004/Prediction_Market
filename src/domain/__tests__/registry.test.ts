import { describe, expect, it } from 'vitest'
import { createRegistry } from '../registry.ts'
import type { MarketSource } from '../types.ts'

/** Fuente mínima para probar el registry; los métodos no se llaman aquí. */
function fakeSource(venue: string): MarketSource {
  const unsupported = async () => {
    throw new Error('no usado en este test')
  }
  return {
    venue,
    chainId: 1,
    displayName: venue,
    capabilities: {
      canQuote: true,
      canPlaceBet: false,
      canReadPositions: false,
      canSubscribe: false,
      canSearch: false,
      canListSubcategories: false,
      canRedeem: false,
      canRankPopular: false,
      canCombo: false,
    },
    listMarkets: unsupported,
    getMarket: unsupported,
    getQuote: unsupported,
    placeBet: unsupported,
    getComboQuote: unsupported,
    placeComboBet: unsupported,
    getPositions: unsupported,
    listSubcategories: unsupported,
    redeemPosition: unsupported,
  }
}

describe('createRegistry', () => {
  it('resuelve la fuente por venue y por id de mercado', () => {
    const azuro = fakeSource('azuro')
    const limitless = fakeSource('limitless')
    const registry = createRegistry([azuro, limitless])

    expect(registry.sources.length).toBe(2)
    expect(registry.byVenue('azuro')).toBe(azuro)
    expect(registry.byVenue('desconocido')).toBeNull()
    expect(registry.sourceFor('limitless:algun-slug')).toBe(limitless)
    expect(registry.sourceFor('azuro:123/456')).toBe(azuro)
    expect(registry.sourceFor('otro:x')).toBeNull()
    expect(registry.sourceFor('sin-separador')).toBeNull()
  })

  it('rechaza dos fuentes con el mismo venue id', () => {
    expect(() => createRegistry([fakeSource('a'), fakeSource('a')])).toThrow()
  })
})
