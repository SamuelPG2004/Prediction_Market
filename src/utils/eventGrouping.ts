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
import { translateMarketLabel, translateOutcomeLabel } from './marketLabels'

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
  /** Total apostado al evento (métrica del grupo, no se suma), o `null`. */
  totalVolumeUsd: number | null
  /** Participantes del grupo (equipos/jugadores), si el venue los publica. */
  participants?: { name: string; imageUrl?: string }[]
  /** Nombre de la competición, si el venue lo publica. */
  leagueName?: string
  /** El evento está en juego ahora mismo. */
  isLive: boolean
}

/**
 * Etiqueta del mercado tal y como la publica el venue (en inglés). Es la que
 * casan los patrones de ranking y la clave de agrupación: la traducción es
 * solo de presentación.
 */
export function rawOptionLabelOf(market: Market): string {
  if (market.group === undefined) return market.question
  // El adaptador compone `question` como "{grupo} · {título propio}"; para la
  // fila de opción basta el título propio.
  const prefix = `${market.group.label} · `
  return market.question.startsWith(prefix)
    ? market.question.slice(prefix.length)
    : market.question
}

/** Etiqueta corta de un mercado dentro de su tarjeta, ya en español. */
export function optionLabelOf(market: Market): string {
  return translateMarketLabel(rawOptionLabelOf(market))
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
 * El mercado "estrella" de un evento: el ganador del partido si existe (se
 * prefiere el que cotiza), o el único mercado si solo hay uno. `null` si el
 * evento no tiene un mercado principal claro.
 */
export function findStarMarket(markets: Market[]): Market | null {
  if (markets.length === 1) return markets[0]
  for (const pattern of PREFERRED_MARKET_LABELS) {
    const candidates = markets.filter((m) => pattern.test(rawOptionLabelOf(m)))
    const best = candidates.find((m) => m.isQuotable) ?? candidates[0]
    if (best !== undefined) return best
  }
  return null
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
  return a !== undefined ? translateOutcomeLabel(a.label) : '—'
}

export interface MarketDisplayGroup {
  /** Título compartido ("Total Games"); cada mercado del grupo es una línea. */
  label: string
  markets: Market[]
}

/**
 * Forma de presentación de un grupo en el selector del evento:
 *  - 'over-under': cada línea es un Más/Menos con su número → tabla de dos
 *    columnas (Más | Menos) con la línea delante.
 *  - 'two-sided': dos resultados por mercado, uno por participante → tabla
 *    con una columna por participante (hándicaps, ganador del set…).
 *  - 'list': cualquier otra cosa; se pinta como lista genérica.
 */
export type MarketGroupShape = 'over-under' | 'two-sided' | 'list'

const OVER_LABEL = /^over\s*\(/i
const UNDER_LABEL = /^under\s*\(/i

function labelMatchesName(label: string, name: string): boolean {
  return label.trim().toLowerCase().startsWith(name.trim().toLowerCase())
}

export function marketGroupShapeOf(
  markets: Market[],
  participants?: { name: string }[],
): MarketGroupShape {
  if (markets.length === 0) return 'list'

  const allOverUnder = markets.every((m) => {
    const [a, b] = m.outcomes
    return (
      m.outcomes.length === 2 &&
      a !== undefined &&
      b !== undefined &&
      ((OVER_LABEL.test(a.label) && UNDER_LABEL.test(b.label)) ||
        (UNDER_LABEL.test(a.label) && OVER_LABEL.test(b.label))) &&
      marketLineOf(m) !== null
    )
  })
  if (allOverUnder) return 'over-under'

  if (participants !== undefined && participants.length === 2) {
    const [pa, pb] = participants
    const twoSided = markets.every(
      (m) =>
        m.outcomes.length === 2 &&
        m.outcomes.some((o) => labelMatchesName(o.label, pa.name)) &&
        m.outcomes.some((o) => labelMatchesName(o.label, pb.name)),
    )
    if (twoSided) return 'two-sided'
  }
  return 'list'
}

/** El resultado del mercado que pertenece a ese participante, si casa. */
export function outcomeForParticipant(
  market: Market,
  name: string,
): Market['outcomes'][number] | undefined {
  return market.outcomes.find((o) => labelMatchesName(o.label, name))
}

/** Línea de UN resultado: "Lan Mi (-7.5)" → "-7.5". `null` si no lleva. */
export function outcomeLineOf(label: string): string | null {
  const m = label.match(/\((-?\d+(?:\.\d+)?)\)/)
  return m?.[1] ?? null
}

/**
 * Ordena los mercados de un evento para mostrarlos: agrupados por título, con
 * el ganador del partido primero y el resto alfabético; dentro de un grupo,
 * las líneas de menor a mayor. Sin esto, un evento con 30 mercados es una
 * lista donde "Total Games" aparece diez veces seguidas en orden aleatorio.
 */
export function groupMarketsForDisplay(markets: Market[]): MarketDisplayGroup[] {
  // Se agrupa y rankea por la etiqueta cruda del venue; la traducida es la
  // que se enseña.
  const byLabel = new Map<string, Market[]>()
  for (const m of markets) {
    const label = rawOptionLabelOf(m)
    const list = byLabel.get(label)
    if (list === undefined) byLabel.set(label, [m])
    else list.push(m)
  }

  const groups = [...byLabel.entries()].map(([rawLabel, ms]) => ({
    label: translateMarketLabel(rawLabel),
    rank: labelRankOf(rawLabel),
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
    if (a.rank !== b.rank) return a.rank - b.rank
    return a.label.localeCompare(b.label, 'es')
  })
  return groups.map(({ label, markets: ms }) => ({ label, markets: ms }))
}

// ---------------------------------------------------------------------------
// Vista de lista: eventos agrupados por día y, dentro del día, por liga
// ---------------------------------------------------------------------------

export interface EventListLeague {
  /** Nombre de la competición, o 'Otros' si el venue no lo publica. */
  league: string
  events: MarketEventView[]
}

export interface EventListDay {
  /** Clave estable del bloque ('live', 'aaaa-mm-dd' o 'none'). */
  key: string
  /** "En juego", "Hoy", "Mañana" o la fecha corta. */
  label: string
  leagues: EventListLeague[]
}

/**
 * Agrupa eventos para el modo lista: primero lo que está en juego, luego por
 * día de comienzo y, dentro de cada bloque, por liga en orden de aparición
 * (el refresco en vivo no debe recolocar filas bajo el cursor).
 */
export function groupEventsForList(
  events: MarketEventView[],
  now: Date = new Date(),
): EventListDay[] {
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const dayMs = 24 * 60 * 60 * 1000

  const dayOf = (event: MarketEventView): { key: string; label: string } => {
    if (event.isLive) return { key: 'live', label: 'En juego' }
    const date = event.markets[0]?.closesAt ?? null
    if (date === null) return { key: 'none', label: 'Sin fecha' }
    const diff = Math.round((startOfDay(date) - startOfDay(now)) / dayMs)
    const key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
    if (diff === 0) return { key, label: 'Hoy' }
    if (diff === 1) return { key, label: 'Mañana' }
    return {
      key,
      label: date.toLocaleDateString('es', {
        weekday: 'long',
        day: 'numeric',
        month: 'short',
      }),
    }
  }

  const days = new Map<
    string,
    { label: string; sortAt: number; leagues: Map<string, MarketEventView[]> }
  >()
  for (const event of events) {
    const { key, label } = dayOf(event)
    let day = days.get(key)
    if (day === undefined) {
      const sortAt =
        key === 'live'
          ? -Infinity
          : key === 'none'
            ? Infinity
            : startOfDay(event.markets[0]!.closesAt!)
      day = { label, sortAt, leagues: new Map() }
      days.set(key, day)
    }
    const league = event.leagueName ?? 'Otros'
    const list = day.leagues.get(league)
    if (list === undefined) day.leagues.set(league, [event])
    else list.push(event)
  }

  return [...days.entries()]
    .sort((a, b) => a[1].sortAt - b[1].sortAt)
    .map(([key, day]) => ({
      key,
      label: day.label,
      leagues: [...day.leagues.entries()].map(([league, list]) => ({
        league,
        events: list,
      })),
    }))
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
        totalVolumeUsd: null,
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
      totalVolumeUsd: market.group.totalVolumeUsd ?? null,
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
