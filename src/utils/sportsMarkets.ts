import type { Market } from '../domain/types'
import { findStarMarket, groupMarketsForDisplay, rawOptionLabelOf } from './eventGrouping'

export const SPORTS_MARKET_CATEGORIES = [
  { id: 'main', label: 'Principales' },
  { id: 'totals', label: 'Goles y totales' },
  { id: 'handicap', label: 'Hándicap' },
  { id: 'periods', label: 'Partes y periodos' },
  { id: 'corners', label: 'Córneres' },
  { id: 'cards', label: 'Tarjetas' },
  { id: 'other', label: 'Otros' },
] as const
export type SportsMarketCategory = typeof SPORTS_MARKET_CATEGORIES[number]['id']

/** Clasificación de presentación. Conserva mercado, resultados e ids originales. */
export function sportsMarketCategory(market: Market): SportsMarketCategory {
  const label = rawOptionLabelOf(market).toLowerCase()
  if (/corners?/.test(label)) return 'corners'
  if (/cards?|bookings?/.test(label)) return 'cards'
  if (/\b(?:half|set|quarter|period|inning|map)\b|half time|^\(\d{2}:\d{2}/.test(label)) return 'periods'
  if (/handicap|puck line|spread/.test(label)) return 'handicap'
  if (/total|goals?|both teams to score|correct score/.test(label)) return 'totals'
  if (/match result|match winner|full time result|^winner$|winner of match|money ?line|1x2|double chance|draw no bet/.test(label)) return 'main'
  return 'other'
}

export function sortedSportsGroups(markets: Market[]) {
  return groupMarketsForDisplay(markets).sort((a, b) => {
    const rank = (market: Market) => SPORTS_MARKET_CATEGORIES.findIndex(c => c.id === sportsMarketCategory(market))
    return rank(a.markets[0]) - rank(b.markets[0])
  })
}

/** Un ganador disponible primero; si falta, otro mercado real con cotización. */
export function displaySportsMarket(markets: Market[]): Market | null {
  const star = findStarMarket(markets)
  if (star?.isQuotable) return star
  const available = sortedSportsGroups(markets).flatMap(g => g.markets).find(m =>
    m.isQuotable && m.outcomes.some(o => o.isQuotable && o.price !== null))
  return available ?? star ?? markets[0] ?? null
}
