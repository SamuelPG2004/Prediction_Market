/**
 * Marcadores en vivo de los eventos visibles, en push por el socket del venue.
 *
 * Recibe los eventos del carrusel "En vivo" y devuelve un mapa
 * `MarketEventView.id → LiveScore` que se actualiza solo. Solo dominio: se
 * pregunta al registry qué fuentes saben dar marcadores (`canLiveScores`) y
 * se les pasa el `group.id`; ningún componente sabe de qué venue viene nada.
 *
 * La suscripción se rehace SOLO cuando cambia el conjunto de eventos (clave
 * serializada), no en cada refresco del catálogo: `useLiveEvents` renueva el
 * array cada pocos segundos y resuscribirse cada vez castigaría el socket.
 */
import { useEffect, useMemo, useState } from 'react'
import type { LiveScore, VenueId } from '../domain/types'
import { marketSources } from '../services/marketSources'
import type { MarketEventView } from '../utils/eventGrouping'

/** Separadores fuera del alfabeto de venues e ids (letras, dígitos, `:`). */
const GROUP_SEPARATOR = ';'
const ID_SEPARATOR = ','

export function useLiveScores(
  events: MarketEventView[],
): ReadonlyMap<string, LiveScore> {
  const [scores, setScores] = useState<ReadonlyMap<string, LiveScore>>(
    new Map(),
  )

  // Conjunto a suscribir, como clave estable: `venue|id1,id2;venue2|...`.
  const specKey = useMemo(() => {
    const groupsByVenue = new Map<VenueId, Set<string>>()
    for (const event of events) {
      const market = event.markets[0]
      const groupId = market?.group?.id
      if (market === undefined || groupId === undefined) continue
      const source = marketSources.byVenue(market.venue)
      if (source === null || !source.capabilities.canLiveScores) continue
      let ids = groupsByVenue.get(market.venue)
      if (ids === undefined) {
        ids = new Set()
        groupsByVenue.set(market.venue, ids)
      }
      ids.add(groupId)
    }
    return [...groupsByVenue.entries()]
      .map(([venue, ids]) => `${venue}|${[...ids].sort().join(ID_SEPARATOR)}`)
      .sort()
      .join(GROUP_SEPARATOR)
  }, [events])

  useEffect(() => {
    if (specKey === '') {
      setScores((prev) => (prev.size === 0 ? prev : new Map()))
      return
    }

    const wantedKeys = new Set<string>()
    const unsubscribers: (() => void)[] = []

    for (const group of specKey.split(GROUP_SEPARATOR)) {
      const [venue, joined] = group.split('|') as [VenueId, string]
      const groupIds = joined.split(ID_SEPARATOR)
      for (const id of groupIds) wantedKeys.add(`${venue}:${id}`)

      const source = marketSources.byVenue(venue)
      const subscribe = source?.subscribeLiveScores?.bind(source)
      if (subscribe === undefined) continue
      unsubscribers.push(
        subscribe(groupIds, (score) => {
          setScores((prev) => {
            const next = new Map(prev)
            // La clave coincide con `MarketEventView.id` (`${venue}:${groupId}`).
            next.set(`${venue}:${score.groupId}`, score)
            return next
          })
        }),
      )
    }

    // Los marcadores de eventos que salieron del carrusel se retiran: un
    // partido terminado no debe dejar un marcador huérfano en memoria.
    setScores((prev) => {
      const kept = [...prev].filter(([key]) => wantedKeys.has(key))
      return kept.length === prev.size ? prev : new Map(kept)
    })

    return () => {
      for (const unsubscribe of unsubscribers) unsubscribe()
    }
  }, [specKey])

  return scores
}
