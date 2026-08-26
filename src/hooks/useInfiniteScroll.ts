/**
 * Carga automática al llegar al final del listado.
 *
 * Sustituye los botones de "cargar más": el flujo de datos no debe depender de
 * que el usuario pulse nada.
 */

import { useEffect, useRef } from 'react'

export interface InfiniteScrollOptions {
  /** Se llama cuando el centinela entra en pantalla. */
  onReachEnd: () => void
  /** Si no hay nada más que cargar, no se observa. */
  enabled: boolean
  /**
   * Margen por debajo del viewport para disparar antes de tocar fondo, de modo
   * que el contenido nuevo ya esté ahí cuando el usuario llegue.
   */
  rootMargin?: string
}

/**
 * Devuelve la ref a colocar en un elemento centinela al final de la lista.
 *
 * Se usa IntersectionObserver en lugar de escuchar el evento `scroll`: no
 * dispara en cada píxel y funciona igual dentro de contenedores con scroll
 * propio.
 */
export function useInfiniteScroll({
  onReachEnd,
  enabled,
  rootMargin = '600px',
}: InfiniteScrollOptions) {
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  // La callback se guarda en una ref para no recrear el observer en cada
  // render (cambiaría de identidad al depender de estado del llamador).
  const callbackRef = useRef(onReachEnd)
  useEffect(() => {
    callbackRef.current = onReachEnd
  }, [onReachEnd])

  useEffect(() => {
    if (!enabled) return
    const node = sentinelRef.current
    if (!node) return

    // Margen en píxeles equivalente al rootMargin, para el respaldo por scroll.
    const marginPx = parseInt(rootMargin, 10) || 0

    /** Comprueba a mano si el centinela está a tiro del viewport. */
    const checkProximity = () => {
      const rect = node.getBoundingClientRect()
      if (rect.top - marginPx <= window.innerHeight) {
        callbackRef.current()
      }
    }

    let observer: IntersectionObserver | undefined
    if (typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) callbackRef.current()
        },
        { rootMargin },
      )
      observer.observe(node)
    }

    /**
     * Respaldo por scroll.
     *
     * IntersectionObserver necesita que la página esté compositando: en
     * entornos donde no lo está (pestañas en segundo plano, contenedores
     * headless, algunos webviews) su callback no llega nunca y el listado se
     * quedaría congelado sin forma de avanzar. Un listener de scroll no tiene
     * esa dependencia, así que cubre el hueco.
     *
     * El limitador es por marca de tiempo, NO con requestAnimationFrame: rAF
     * también depende de que se pinten fotogramas, así que usarlo aquí
     * reintroduciría justo la dependencia que este respaldo intenta evitar.
     */
    const THROTTLE_MS = 150
    let lastRun = 0
    const onScroll = () => {
      const now = Date.now()
      if (now - lastRun < THROTTLE_MS) return
      lastRun = now
      checkProximity()
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    // Comprobación inicial: si la lista no llena la pantalla, hay que cargar ya.
    checkProximity()

    return () => {
      observer?.disconnect()
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [enabled, rootMargin])

  return sentinelRef
}
