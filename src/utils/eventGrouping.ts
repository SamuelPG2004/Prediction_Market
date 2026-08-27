/**
 * Agrupa mercados del dominio en "eventos" para las tarjetas de la UI.
 *
 * El dominio no tiene entidad Evento (decisión de la Fase 1): los mercados
 * llevan un `group` opcional (el partido en Azuro, el grupo negRisk en
 * Limitless). Aquí se reconstruye la vista de tarjeta: mercados con el mismo
 * grupo comparten tarjeta; un mercado sin grupo es su propia tarjeta.
 *
 * Solo tipos del dominio: nada de venues.
 */
import type { Market } from '../domain/types'

export interface MarketEventView {
  /** `${venue}:${groupId}` o el id del mercado si no hay grupo. */
  id: string
  title: string
  imageUrl?: string
  markets: Market[]
  /** Presentación binaria: un único mercado de dos resultados. */
  isBinary: boolean
  /** Suma de las métricas conocidas, o `null` si ningún mercado las aporta. */
  liquidityUsd: number | null
  volume24hUsd: number | null
}

/** Etiqueta corta de un mercado dentro de su tarjeta. */
export function optionLabelOf(market: Market): string {
  if (market.group === undefined) return market.question
  // El adaptador compone `question` como "{grupo} · {título propio}"; para la
  // fila de opción basta el título propio.
  const prefix = `${market.group.label} · `
  return market.question.startsWith(prefix)
    ? market.question.slice(prefix.length)
    : market.question
}

function sumOrNull(values: (number | null)[]): number | null {
  const known = values.filter((v): v is number => v !== null)
  if (known.length === 0) return null
  return known.reduce((a, b) => a + b, 0)
}

/**
 * Mantiene el orden de aparición: la primera vez que se ve un grupo fija la
 * posición de su tarjeta. Importante para que el refresco en vivo no recoloque
 * tarjetas bajo el cursor.
 */
export function groupMarketsIntoEvents(markets: Market[]): MarketEventView[] {
  const events: MarketEventView[] = []
  const byGroupId = new Map<string, MarketEventView>()

  for (const market of markets) {
    if (market.group === undefined) {
      events.push({
        id: market.id,
        title: market.question,
        ...(market.imageUrl !== undefined ? { imageUrl: market.imageUrl } : {}),
        markets: [market],
        isBinary: market.outcomes.length === 2,
        liquidityUsd: market.liquidityUsd,
        volume24hUsd: market.volume24hUsd,
      })
      continue
    }

    const key = `${market.venue}:${market.group.id}`
    const existing = byGroupId.get(key)
    if (existing !== undefined) {
      existing.markets.push(market)
      existing.isBinary =
        existing.markets.length === 1 && existing.markets[0].outcomes.length === 2
      existing.liquidityUsd = sumOrNull(
        existing.markets.map((m) => m.liquidityUsd),
      )
      existing.volume24hUsd = sumOrNull(
        existing.markets.map((m) => m.volume24hUsd),
      )
      continue
    }

    const view: MarketEventView = {
      id: key,
      title: market.group.label,
      ...(market.group.imageUrl !== undefined
        ? { imageUrl: market.group.imageUrl }
        : market.imageUrl !== undefined
          ? { imageUrl: market.imageUrl }
          : {}),
      markets: [market],
      isBinary: market.outcomes.length === 2,
      liquidityUsd: market.liquidityUsd,
      volume24hUsd: market.volume24hUsd,
    }
    byGroupId.set(key, view)
    events.push(view)
  }

  // Un grupo con un único mercado de dos resultados se presenta binario,
  // pero con el título del grupo (p. ej. el partido).
  for (const event of events) {
    event.isBinary = event.markets.length === 1 && event.markets[0].outcomes.length === 2
  }
  return events
}
