/**
 * Índice de búsqueda en cliente para las sugerencias instantáneas del buscador.
 *
 * Cada entrada lleva un `normalizedName` (NFD sin diacríticos + minúsculas):
 * "atletico" casa con "Atlético" y "Madrid" con "Real Madrid". El índice se
 * construye sobre los eventos ya descargados, así que responde al instante y
 * sin red; la búsqueda de servidor de cada venue sigue siendo la exhaustiva.
 *
 * Solo tipos del dominio y de la vista: nada de venues.
 */
import type { MarketEventView } from './eventGrouping'

/** Mínimo de caracteres útiles para sugerir (espeja el umbral de los venues). */
export const SUGGESTION_MIN_CHARS = 3

/** Cortes del panel: sugerir es orientar, no volcar el catálogo. */
const MAX_LEAGUE_SUGGESTIONS = 4
const MAX_EVENT_SUGGESTIONS = 8

/** Clave de comparación del índice: sin acentos, sin mayúsculas, sin bordes. */
export function normalizeSearchText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

export interface LeagueSuggestion {
  /** Nombre tal y como lo publica el venue: es la etiqueta y el filtro. */
  name: string
  normalizedName: string
  /** Eventos descargados que pertenecen a la liga. */
  eventCount: number
}

export interface EventSuggestion {
  event: MarketEventView
  /** Título + participantes + liga, normalizados: cualquier parte casa. */
  normalizedName: string
}

export interface SearchIndex {
  leagues: LeagueSuggestion[]
  events: EventSuggestion[]
}

export interface SearchSuggestions {
  leagues: LeagueSuggestion[]
  events: EventSuggestion[]
}

/**
 * Construye el índice a partir de los eventos cargados. Las ligas se deduplican
 * por nombre normalizado y se ordenan por oferta (más eventos primero).
 */
export function buildSearchIndex(events: MarketEventView[]): SearchIndex {
  const leaguesByKey = new Map<string, LeagueSuggestion>()
  const eventEntries: EventSuggestion[] = []

  for (const event of events) {
    const parts = [event.title]
    for (const participant of event.participants ?? []) {
      parts.push(participant.name)
    }
    if (event.leagueName !== undefined) parts.push(event.leagueName)
    eventEntries.push({
      event,
      normalizedName: normalizeSearchText(parts.join(' · ')),
    })

    if (event.leagueName !== undefined) {
      const key = normalizeSearchText(event.leagueName)
      const existing = leaguesByKey.get(key)
      if (existing === undefined) {
        leaguesByKey.set(key, {
          name: event.leagueName,
          normalizedName: key,
          eventCount: 1,
        })
      } else {
        existing.eventCount += 1
      }
    }
  }

  return {
    leagues: [...leaguesByKey.values()].sort(
      (a, b) => b.eventCount - a.eventCount,
    ),
    events: eventEntries,
  }
}

/**
 * Sugerencias para un texto: subcadena sobre `normalizedName`. Devuelve vacío
 * por debajo de `SUGGESTION_MIN_CHARS` caracteres útiles.
 */
export function querySearchIndex(
  index: SearchIndex,
  rawQuery: string,
): SearchSuggestions {
  const query = normalizeSearchText(rawQuery)
  if (query.length < SUGGESTION_MIN_CHARS) return { leagues: [], events: [] }
  return {
    leagues: index.leagues
      .filter((l) => l.normalizedName.includes(query))
      .slice(0, MAX_LEAGUE_SUGGESTIONS),
    events: index.events
      .filter((e) => e.normalizedName.includes(query))
      .slice(0, MAX_EVENT_SUGGESTIONS),
  }
}
