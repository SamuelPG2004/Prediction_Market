/**
 * Ligas activas de una subcategoría (deporte), agregadas de las fuentes que
 * declaran `canListLeagues`. Para 'sports' hoy responde Azuro con sus países
 * y competiciones; un venue futuro se sumaría solo.
 *
 * Cambia despacio (altas/bajas de competiciones, no precios): se pide una vez
 * por (categoría, subcategoría) y se cachea a nivel de módulo.
 */
import { useEffect, useState } from 'react'
import type { League, MarketCategory } from '../domain/types'
import { marketSources } from '../services/marketSources'

const cache = new Map<string, League[]>()

export function useLeagues(
  category: MarketCategory | undefined,
  subcategory: string | undefined,
): {
  leagues: League[]
  isLoading: boolean
} {
  const key =
    category !== undefined && subcategory !== undefined
      ? `${category}:${subcategory}`
      : null
  const [leagues, setLeagues] = useState<League[]>(
    key !== null ? (cache.get(key) ?? []) : [],
  )
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (key === null || category === undefined || subcategory === undefined) {
      setLeagues([])
      return
    }
    const cached = cache.get(key)
    if (cached !== undefined) {
      setLeagues(cached)
      return
    }

    let alive = true
    setIsLoading(true)
    Promise.all(
      marketSources.sources
        .filter((s) => s.capabilities.canListLeagues)
        .map((s) => s.listLeagues(category, subcategory)),
    )
      .then((results) => {
        if (!alive) return
        // Un venue caído no vacía el selector de los demás. Dos venues con la
        // misma liga (mismo id y país) se funden sumando actividad.
        const byKey = new Map<string, League>()
        for (const r of results) {
          if (!r.ok) continue
          for (const l of r.data) {
            const k = `${l.country}:${l.id}`
            const prev = byKey.get(k)
            if (prev === undefined) {
              byKey.set(k, l)
            } else if (prev.activeCount !== null && l.activeCount !== null) {
              byKey.set(k, { ...prev, activeCount: prev.activeCount + l.activeCount })
            }
          }
        }
        const merged = [...byKey.values()].sort(
          (a, b) =>
            a.country.localeCompare(b.country) ||
            (b.activeCount ?? 0) - (a.activeCount ?? 0),
        )
        cache.set(key, merged)
        setLeagues(merged)
      })
      .finally(() => {
        if (alive) setIsLoading(false)
      })

    return () => {
      alive = false
    }
  }, [key, category, subcategory])

  return { leagues, isLoading }
}
