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
  /** Participantes del grupo (equipos/jugadores), si el venue los publica. */
  participants?: { name: string; imageUrl?: string }[]
  /** Nombre de la competición, si el venue lo publica. */
  leagueName?: string
  /** El evento está en juego ahora mismo. */
  isLive: boolean
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

/**
 * Mercados "principales" de un evento, por orden de preferencia: el ganador
 * del partido es lo primero que busca quien mira un evento deportivo.
 */
export const PREFERRED_MARKET_LABELS: RegExp[] = [
  /^full time result$/i,
  /^match winner$/i,
  /^1x2$/i,
  /^winner$/i,
  /^money ?line$/i,
]

function labelRankOf(label: string): number {
  const i = PREFERRED_MARKET_LABELS.findIndex((p) => p.test(label))
  return i === -1 ? PREFERRED_MARKET_LABELS.length : i
}

/**
 * Línea numérica del mercado, si sus resultados la llevan entre paréntesis:
 * "Over (17.5)" → 17.5, "Lan Mi (-7)" → -7. `null` si no hay línea.
 */
export function marketLineOf(market: Market): number | null {
  for (const o of market.outcomes) {
    const m = o.label.match(/\((-?\d+(?:\.\d+)?)\)/)
    if (m !== null) return Number(m[1])
  }
  return null
}

/**
 * Etiqueta que distingue una línea dentro de su grupo: el número solo en
 * totales simétricos ("17.5", el lado ya lo dan los botones Over/Under); en
 * hándicaps el número es ambiguo —no dice de quién es— así que se usa el
 * primer resultado completo ("Hanlei Lu (-1.5)").
 */
export function marketVariantLabelOf(market: Market): string {
  const [a, b] = market.outcomes
  const overUnder = /^(over|under)\s*\(/i
  if (
    market.outcomes.length === 2 &&
    a !== undefined &&
    b !== undefined &&
    overUnder.test(a.label) &&
    overUnder.test(b.label)
  ) {
    const line = marketLineOf(market)
    if (line !== null) return String(line)
  }
  return a?.label ?? '—'
}

export interface MarketDisplayGroup {
  /** Título compartido ("Total Games"); cada mercado del grupo es una línea. */
  label: string
  markets: Market[]
}

/**
 * Ordena los mercados de un evento para mostrarlos: agrupados por título, con
 * el ganador del partido primero y el resto alfabético; dentro de un grupo,
 * las líneas de menor a mayor. Sin esto, un evento con 30 mercados es una
 * lista donde "Total Games" aparece diez veces seguidas en orden aleatorio.
 */
export function groupMarketsForDisplay(markets: Market[]): MarketDisplayGroup[] {
  const byLabel = new Map<string, Market[]>()
  for (const m of markets) {
    const label = optionLabelOf(m)
    const list = byLabel.get(label)
    if (list === undefined) byLabel.set(label, [m])
    else list.push(m)
  }

  const groups = [...byLabel.entries()].map(([label, ms]) => ({
    label,
    markets: [...ms].sort((a, b) => {
      const la = marketLineOf(a)
      const lb = marketLineOf(b)
      if (la === null && lb === null) return 0
      if (la === null) return 1
      if (lb === null) return -1
      return la - lb
    }),
  }))

  groups.sort((a, b) => {
    const ra = labelRankOf(a.label)
    const rb = labelRankOf(b.label)
    if (ra !== rb) return ra - rb
    return a.label.localeCompare(b.label, 'es')
  })
  return groups
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
        isLive: false,
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
      ...(market.group.participants !== undefined
        ? { participants: market.group.participants }
        : {}),
      ...(market.group.leagueName !== undefined
        ? { leagueName: market.group.leagueName }
        : {}),
      isLive: market.group.isLive === true,
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
