/**
 * Subcategorías activas de una categoría, agregadas de todas las fuentes que
 * declaran `canListSubcategories`. Para 'sports' hoy responde Azuro (deportes
 * con partidos prematch); un venue futuro se sumaría solo.
 *
 * Cambia despacio (altas/bajas de deportes, no precios), así que se pide una
 * vez por categoría y se cachea a nivel de módulo mientras viva la pestaña.
 */
import { useEffect, useState } from 'react'
import type { MarketCategory, Subcategory } from '../domain/types'
import { marketSources } from '../services/marketSources'

const cache = new Map<MarketCategory, Subcategory[]>()

export function useSubcategories(category: MarketCategory | undefined): {
  subcategories: Subcategory[]
  isLoading: boolean
} {
  const [subcategories, setSubcategories] = useState<Subcategory[]>(
    category !== undefined ? (cache.get(category) ?? []) : [],
  )
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (category === undefined) {
      setSubcategories([])
      return
    }
    const cached = cache.get(category)
    if (cached !== undefined) {
      setSubcategories(cached)
      return
    }

    let alive = true
    setIsLoading(true)
    Promise.all(
      marketSources.sources
        .filter((s) => s.capabilities.canListSubcategories)
        .map((s) => s.listSubcategories(category)),
    )
      .then((results) => {
        if (!alive) return
        // Un venue caído no vacía los chips de los demás; simplemente no suma.
        // Si dos venues sirven la misma subcategoría, se funden sumando la
        // actividad de ambos.
        const byId = new Map<string, Subcategory>()
        for (const r of results) {
          if (!r.ok) continue
          for (const s of r.data) {
            const prev = byId.get(s.id)
            if (prev === undefined) {
              byId.set(s.id, s)
            } else if (prev.activeCount !== null && s.activeCount !== null) {
              byId.set(s.id, {
                ...prev,
                activeCount: prev.activeCount + s.activeCount,
              })
            }
          }
        }
        const merged = [...byId.values()].sort(
          (a, b) => (b.activeCount ?? 0) - (a.activeCount ?? 0),
        )
        cache.set(category, merged)
        setSubcategories(merged)
      })
      .finally(() => {
        if (alive) setIsLoading(false)
      })

    return () => {
      alive = false
    }
  }, [category])

  return { subcategories, isLoading }
}
